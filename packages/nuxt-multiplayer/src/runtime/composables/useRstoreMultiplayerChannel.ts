import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { MultiplayerLeaveMessage, MultiplayerMessage, MultiplayerPeer, MultiplayerPresenceMessage, MultiplayerTextCursor, MultiplayerUpdateMessage, MultiplayerUser } from '../types'
import { isClient, tryOnScopeDispose, useEventListener, useWebSocket } from '@vueuse/core'
import { useRuntimeConfig } from 'nuxt/app'
import { computed, ref, shallowRef, triggerRef, watch } from 'vue'
import { isMultiplayerPeerStrict, validateMultiplayerMessage } from '../utils/messageGuards'
import { areMultiplayerTextCursorsEqual, rebaseMultiplayerTextCursor } from '../utils/multiplayerTextCursor'
import { createMultiplayerUser } from '../utils/multiplayerUser'

export interface UseRstoreMultiplayerChannelOptions {
  roomId: string
  endpoint?: string
  user?: Partial<MultiplayerUser>
  heartbeatInterval?: number
  stalePeerTimeout?: number
  colors?: readonly string[]
}

export interface RstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
> {
  user: MultiplayerUser
  /**
   * Connection-scoped id, unique per channel instance. Used to filter
   * self-echoed frames so two tabs of the same user still see each other.
   */
  clientId: string
  /**
   * One entry per remote connection (keyed by `clientId`) — two tabs of
   * the same user yield two peers sharing the same `id`. Use
   * `presenceUsers` for a per-user aggregated list.
   */
  peers: ComputedRef<MultiplayerPeer<TField>[]>
  /** Peers deduplicated by user id — one entry per remote user. */
  presenceUsers: ComputedRef<MultiplayerPeer<TField>[]>
  remoteUpdate: Ref<TUpdate | null>
  status: Ref<string>
  joinRoom: () => void
  leaveRoom: () => void
  sendUpdate: (update: TUpdate) => void
  setFocusedField: (field?: TField | null) => void
  setTextCursor: (field: TField, cursor: MultiplayerTextCursor) => void
  rebaseTextCursor: (field: TField, previousValue: string, nextValue: string) => void
  clearFocus: () => void
}

export function useRstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
>(
  options: UseRstoreMultiplayerChannelOptions,
): RstoreMultiplayerChannel<TUpdate, TField> {
  const runtimeConfig = useRuntimeConfig()
  const endpoint = (options.endpoint ?? runtimeConfig.public.wsEndpoint) as string | undefined
  const ws = useWebSocket(endpoint, {
    autoReconnect: true,
    // Closing is owned by `disconnect` below. VueUse's own scope cleanup is
    // registered first, so it would close the socket before `leave` is sent,
    // buffering the frame and leaving a ghost presence on peers.
    autoClose: false,
    // `onMessage` fires for every frame — unlike watching `ws.data`,
    // which skips consecutive identical payloads (Object.is) and would
    // let idle peers' heartbeats go unseen until stale cleanup evicts them.
    onMessage: (_ws, event) => {
      handleIncomingMessage(event.data)
    },
  })

  const user = createMultiplayerUser(options.user, options.colors)
  // Connection-scoped id: two tabs of the same authenticated user get two
  // distinct clientIds, so self-echo filtering never hides sibling tabs.
  const clientId = crypto.randomUUID()
  const peers = shallowRef(new Map<string, MultiplayerPeer<TField>>()) as ShallowRef<Map<string, MultiplayerPeer<TField>>>
  const remoteUpdate = shallowRef<TUpdate | null>(null)
  const localField = shallowRef(null) as ShallowRef<TField | null>
  const localCursor = ref<MultiplayerTextCursor | null>(null)

  function sendMessage(message: MultiplayerMessage<TUpdate, TField>) {
    ws.send(JSON.stringify(message))
  }

  function sendPresence() {
    sendMessage({
      type: 'multiplayer:presence',
      roomId: options.roomId,
      user,
      clientId,
      field: localField.value,
      cursor: localCursor.value,
    } satisfies MultiplayerPresenceMessage<TField>)
  }

  function joinRoom() {
    sendPresence()
  }

  function leaveRoom() {
    sendMessage({
      type: 'multiplayer:leave',
      roomId: options.roomId,
      userId: user.id,
      clientId,
    } satisfies MultiplayerLeaveMessage)
  }

  function sendUpdate(update: TUpdate) {
    sendMessage({
      type: 'multiplayer:update',
      roomId: options.roomId,
      data: update,
      userId: user.id,
      clientId,
    } satisfies MultiplayerUpdateMessage<TUpdate>)
  }

  function clearFocus() {
    localField.value = null
    localCursor.value = null
    sendPresence()
  }

  function setFocusedField(field?: TField | null) {
    const nextField = field ?? null
    if (nextField !== localField.value) {
      localCursor.value = null
    }
    localField.value = nextField
    if (!nextField) {
      localCursor.value = null
    }
    sendPresence()
  }

  function setTextCursor(field: TField, cursor: MultiplayerTextCursor) {
    localField.value = field
    localCursor.value = cursor
    sendPresence()
  }

  function rebaseTextCursor(field: TField, previousValue: string, nextValue: string) {
    if (previousValue === nextValue) {
      return
    }

    let didUpdatePeers = false

    if (localField.value === field && localCursor.value) {
      const rebasedLocalCursor = rebaseMultiplayerTextCursor(localCursor.value, previousValue, nextValue)
      if (!areMultiplayerTextCursorsEqual(localCursor.value, rebasedLocalCursor)) {
        localCursor.value = rebasedLocalCursor
        sendPresence()
      }
    }

    for (const [id, peer] of peers.value) {
      if (peer.field !== field || !peer.cursor) {
        continue
      }

      const rebasedPeerCursor = rebaseMultiplayerTextCursor(peer.cursor, previousValue, nextValue)
      if (areMultiplayerTextCursorsEqual(peer.cursor, rebasedPeerCursor)) {
        continue
      }

      peers.value.set(id, {
        ...peer,
        cursor: rebasedPeerCursor,
      })
      didUpdatePeers = true
    }

    if (didUpdatePeers) {
      triggerRef(peers)
    }
  }

  /**
   * Processes a raw incoming frame. Self-echo is filtered by `clientId`
   * (not user id) so two tabs of the same user keep seeing each other.
   */
  function handleIncomingMessage(data: unknown) {
    if (!data) {
      return
    }

    const message = validateMultiplayerMessage<TUpdate, TField>(data)
    if (!message || message.roomId !== options.roomId || message.clientId === clientId) {
      return
    }

    if (message.type === 'multiplayer:update') {
      remoteUpdate.value = message.data
    }
    else if (message.type === 'multiplayer:presence') {
      peers.value.set(message.clientId, {
        ...message.user,
        clientId: message.clientId,
        field: message.field ?? null,
        cursor: message.cursor ?? null,
        lastSeen: Date.now(),
      })
      triggerRef(peers)
    }
    else if (message.type === 'multiplayer:leave') {
      peers.value.delete(message.clientId)
      triggerRef(peers)
    }
  }

  watch(ws.status, (status) => {
    if (status === 'OPEN') {
      sendPresence()
    }
  })

  // Timers only make sense in the browser. Vue never unmounts server-rendered
  // components, so on the server they would outlive every request. Same
  // runtime check `useWebSocket` uses to skip connecting on the server.
  if (isClient) {
    startPresenceTimers()
    // Replaces VueUse's `autoClose` page-unload handling.
    useEventListener('beforeunload', disconnect, { passive: true })
  }

  /** Announce departure while the socket is still open, then close it. */
  function disconnect() {
    leaveRoom()
    ws.close()
  }

  /** Start stale-peer eviction and heartbeat, stopped with the owning scope. */
  function startPresenceTimers() {
    const stalePeerTimeout = options.stalePeerTimeout ?? 15000
    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [id, peer] of peers.value) {
        if (now - peer.lastSeen > stalePeerTimeout) {
          peers.value.delete(id)
          triggerRef(peers)
        }
      }
    }, 5000)

    const heartbeatInterval = setInterval(() => {
      if (ws.status.value === 'OPEN') {
        sendPresence()
      }
    }, options.heartbeatInterval ?? 5000)

    // Scope disposal (not `onUnmounted`) also covers channels created in a
    // detached `effectScope` or store setup instead of a component.
    tryOnScopeDispose(() => {
      disconnect()
      clearInterval(cleanupInterval)
      clearInterval(heartbeatInterval)
    })
  }

  const validPeers = computed(() => Array.from(peers.value.values()).filter(isMultiplayerPeerStrict<TField>))

  // Aggregate per user for display purposes — a user active in several
  // tabs collapses into their most recently seen connection.
  const presenceUsers = computed(() => {
    const byUser = new Map<string, MultiplayerPeer<TField>>()
    for (const peer of validPeers.value) {
      const existing = byUser.get(peer.id)
      if (!existing || peer.lastSeen > existing.lastSeen) {
        byUser.set(peer.id, peer)
      }
    }
    return Array.from(byUser.values())
  })

  return {
    user,
    clientId,
    peers: validPeers,
    presenceUsers,
    remoteUpdate,
    status: ws.status,
    joinRoom,
    leaveRoom,
    sendUpdate,
    setFocusedField,
    setTextCursor,
    rebaseTextCursor,
    clearFocus,
  }
}
