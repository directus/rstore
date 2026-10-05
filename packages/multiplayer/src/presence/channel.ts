import type { MultiplayerMessage, MultiplayerTextCursor, MultiplayerTypingTarget } from '../protocol/types.js'
import type { MultiplayerPeer, PresenceChannelOptions, PresenceChannelState } from './types.js'
import { parseMultiplayerMessage } from '../protocol/guards.js'
import { areMultiplayerTextCursorsEqual, rebaseMultiplayerTextCursor } from './cursor.js'
import { aggregatePeersByUser, evictStalePeers, isMultiplayerPeerStrict } from './peers.js'
import { createLocalTyping, createTypingTracker } from './typing.js'
import { createMultiplayerUser } from './user.js'

/**
 * Framework-agnostic presence channel for one room: heartbeats, the peer map
 * with stale eviction and per-user aggregation, focused field and cursor
 * (rebased over text changes), typing indicators and state updates.
 *
 * Self-echo is filtered by `clientId`, not user id, so two tabs of the same
 * user see each other. Read the state with `getState()` and `subscribe()`;
 * receive state updates with `onUpdate()`. Call `dispose()` to leave.
 */
export function createPresenceChannel<TUpdate = Record<string, any>, TField extends string = string>(options: PresenceChannelOptions) {
  const { roomId, transport } = options
  const now = options.now ?? Date.now
  const staleMs = options.staleMs ?? 15_000
  const typingTimeoutMs = options.typingTimeoutMs ?? 3000
  const user = createMultiplayerUser(options.user, options.colors)
  const clientId = options.clientId ?? crypto.randomUUID()

  const peers = new Map<string, MultiplayerPeer<TField>>()
  const listeners = new Set<(state: PresenceChannelState<TField>) => void>()
  const updateListeners = new Set<(update: TUpdate) => void>()
  const typing = createTypingTracker({ timeoutMs: typingTimeoutMs, onChange: emit })
  const localTyping = createLocalTyping({ throttleMs: options.typingThrottleMs ?? 1000, timeoutMs: typingTimeoutMs, now })
  let localField: TField | null = null
  let localCursor: MultiplayerTextCursor | null = null
  let state = computeState()

  function computeState(): PresenceChannelState<TField> {
    const validPeers = Array.from(peers.values()).filter(isMultiplayerPeerStrict<TField>)
    return { peers: validPeers, users: aggregatePeersByUser(validPeers), typing: typing.list() }
  }

  /** Recompute the snapshot and notify subscribers. */
  function emit() {
    state = computeState()
    for (const listener of listeners)
      listener(state)
  }

  function send(message: MultiplayerMessage<TUpdate, TField>) {
    transport.send(JSON.stringify(message))
  }

  function sendPresence() {
    send({ type: 'multiplayer:presence', roomId, user, clientId, field: localField, cursor: localCursor })
  }

  function sendTyping(target: MultiplayerTypingTarget | null) {
    send({ type: 'multiplayer:typing', roomId, userId: user.id, clientId, target })
  }

  function leave() {
    send({ type: 'multiplayer:leave', roomId, userId: user.id, clientId })
  }

  /** Stop the local typing indicator (blur, focus change, leave). */
  function stopTyping() {
    if (localTyping.stop())
      sendTyping(null)
  }

  function setFocusedField(field?: TField | null) {
    const nextField = field ?? null
    if (nextField !== localField) {
      localCursor = null
      stopTyping()
    }
    localField = nextField
    sendPresence()
  }

  /**
   * Clear the local focus. With `field`, only when it still has the focus:
   * a delayed blur of a field must not clear the focus another field took.
   */
  function clearFocus(field?: TField | null) {
    if (field != null && field !== localField)
      return
    stopTyping()
    localField = null
    localCursor = null
    sendPresence()
  }

  function setTextCursor(field: TField, cursor: MultiplayerTextCursor) {
    localField = field
    localCursor = cursor
    sendPresence()
  }

  /** Rebase the local and peer cursors on `field` after its text changed. */
  function rebaseTextCursor(field: TField, previousValue: string, nextValue: string) {
    if (previousValue === nextValue)
      return

    if (localField === field && localCursor) {
      const rebased = rebaseMultiplayerTextCursor(localCursor, previousValue, nextValue)
      if (!areMultiplayerTextCursorsEqual(localCursor, rebased)) {
        localCursor = rebased
        sendPresence()
      }
    }

    let changed = false
    for (const [id, peer] of peers) {
      if (peer.field !== field || !peer.cursor)
        continue
      const rebased = rebaseMultiplayerTextCursor(peer.cursor, previousValue, nextValue)
      if (!areMultiplayerTextCursorsEqual(peer.cursor, rebased)) {
        peers.set(id, { ...peer, cursor: rebased })
        changed = true
      }
    }
    if (changed)
      emit()
  }

  /** Process one raw frame from the transport. Invalid, foreign-room and self-echoed frames are ignored. */
  function receive(raw: unknown) {
    const message = parseMultiplayerMessage<TUpdate, TField>(raw, { onInvalid: options.onInvalidMessage })
    if (!message || message.roomId !== roomId || message.clientId === clientId)
      return

    switch (message.type) {
      case 'multiplayer:update':
        for (const listener of updateListeners)
          listener(message.data)
        break
      case 'multiplayer:presence':
        peers.set(message.clientId, {
          ...message.user,
          clientId: message.clientId,
          field: message.field ?? null,
          cursor: message.cursor ?? null,
          lastSeen: now(),
        })
        emit()
        break
      case 'multiplayer:leave':
        peers.delete(message.clientId)
        typing.remove(message.clientId)
        emit()
        break
      case 'multiplayer:typing':
        typing.set(message.clientId, message.userId, message.target)
        break
    }
  }

  const heartbeat = setInterval(() => {
    if (transport.isOpen?.() ?? true)
      sendPresence()
  }, options.heartbeatMs ?? 5000)

  const sweep = setInterval(() => {
    if (evictStalePeers(peers, now(), staleMs))
      emit()
  }, options.sweepMs ?? 5000)

  return {
    roomId,
    user,
    clientId,
    getState: () => state,
    /** Listen to state changes. Returns an unsubscribe function. */
    subscribe(listener: (state: PresenceChannelState<TField>) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Listen to `multiplayer:update` payloads of other connections. */
    onUpdate(listener: (update: TUpdate) => void): () => void {
      updateListeners.add(listener)
      return () => updateListeners.delete(listener)
    },
    receive,
    /** Announce the transport (re)opened: sends presence at once. */
    handleOpen: sendPresence,
    join: sendPresence,
    leave,
    sendUpdate(update: TUpdate) {
      send({ type: 'multiplayer:update', roomId, data: update, userId: user.id, clientId })
    },
    setFocusedField,
    setTextCursor,
    rebaseTextCursor,
    clearFocus,
    /** Announce a keystroke on `target` (throttled; never sends content). */
    notifyTyping(target: MultiplayerTypingTarget) {
      if (localTyping.notify(target))
        sendTyping(target)
    },
    stopTyping,
    /** Leave the room and stop every timer. */
    dispose() {
      leave()
      clearInterval(heartbeat)
      clearInterval(sweep)
      typing.dispose()
      listeners.clear()
      updateListeners.clear()
    },
  }
}

/** Instance returned by `createPresenceChannel`. */
export type PresenceChannel<TUpdate = Record<string, any>, TField extends string = string> = ReturnType<typeof createPresenceChannel<TUpdate, TField>>
