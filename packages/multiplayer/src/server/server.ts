import type { MultiplayerMessage } from '../protocol/types.js'
import type { MultiplayerServerHookRegistry, MultiplayerServerPeer } from './hooks.js'
import type { TokenBucketOptions } from './rateLimit.js'
import type { RoomPeer } from './rooms.js'
import { parseMultiplayerMessage } from '../protocol/guards.js'
import { createMultiplayerServerHooks } from './hooks.js'
import { PeerIdentityStore } from './identity.js'
import { PeerRateLimiter } from './rateLimit.js'
import { RoomRegistry } from './rooms.js'

/** Options of `createMultiplayerServer`. */
export interface MultiplayerServerOptions<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer> {
  /** Hook registry (`multiplayer.authorize`, `multiplayer.filter`). @default a new registry */
  hooks?: MultiplayerServerHookRegistry<TPeer>
  /** Peers per room; further joins are dropped. @default 100 */
  maxRoomSize?: number
  /** Frames longer than this (in UTF-16 code units) are dropped, the connection stays open. @default 16384 */
  maxMessageBytes?: number
  /** Per-peer token bucket; `null`/`false` disables it. @default { capacity: 60, refillPerSecond: 30 } */
  rateLimit?: TokenBucketOptions | null | false
}

/**
 * Transport-agnostic room server for `multiplayer:*` frames. Adapters (a
 * Nitro WebSocket handler, a Durable Object…) forward each text frame to
 * `handleMessage` and each disconnect to `handleClose`.
 *
 * Pipeline per frame: size limit, rate limit, parse and validate,
 * `multiplayer.authorize` once per (peer, room) with room capacity, identity
 * binding and stamping, `multiplayer.filter`, then broadcast to the other
 * room members. A closing peer leaves its rooms with a synthesized
 * `multiplayer:leave` frame.
 */
export function createMultiplayerServer<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer>(options: MultiplayerServerOptions<TPeer> = {}) {
  const hooks = options.hooks ?? createMultiplayerServerHooks<TPeer>()
  const maxMessageBytes = options.maxMessageBytes ?? 16 * 1024
  const registry = new RoomRegistry({ maxRoomSize: options.maxRoomSize })
  const rateLimit = options.rateLimit === undefined ? { capacity: 60, refillPerSecond: 30 } : options.rateLimit
  const rateLimiter = rateLimit ? new PeerRateLimiter(rateLimit) : null
  /** Rooms each peer belongs to, to clean up membership on disconnect. */
  const peerRooms = new Map<string, Set<string>>()
  /** Identity bound to each connection: stamps every relayed frame. */
  const identities = new PeerIdentityStore()

  /** Rooms broadcast objects; the transport receives JSON text. */
  function toRoomPeer(peer: TPeer): RoomPeer {
    return {
      id: peer.id,
      send: payload => peer.send(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    }
  }

  /**
   * Run `multiplayer.authorize` and join the room. Resolves to `false` when
   * the peer is refused (rejected, throwing handler or full room), otherwise
   * to the user id bound by a handler, if any.
   */
  async function join(peer: TPeer, roomId: string): Promise<false | { userId?: string }> {
    let rejected = false
    let userId: string | undefined
    try {
      await hooks.callHook('multiplayer.authorize', {
        peer,
        roomId,
        reject: () => {
          rejected = true
        },
        setUserId: (id: string) => {
          userId = id
        },
      })
    }
    catch (error) {
      console.error('[rstore-multiplayer-server] authorize hook threw', error)
      rejected = true
    }
    if (rejected || !registry.getOrCreate(roomId).add(toRoomPeer(peer)))
      return false
    return { userId }
  }

  /** Whether `multiplayer.filter` lets `message` through. A throwing handler drops it. */
  async function passesFilter(peer: TPeer, message: MultiplayerMessage): Promise<boolean> {
    let filtered = false
    try {
      await hooks.callHook('multiplayer.filter', {
        peer,
        roomId: message.roomId,
        message,
        reject: () => {
          filtered = true
        },
      })
    }
    catch (error) {
      console.error('[rstore-multiplayer-server] filter hook threw', error)
      filtered = true
    }
    return !filtered
  }

  /** Handle one inbound text frame from `peer`. Invalid or refused frames are dropped silently. */
  async function handleMessage(peer: TPeer, text: string): Promise<void> {
    if (text.length > maxMessageBytes)
      return
    if (rateLimiter && !rateLimiter.consume(peer.id))
      return

    const message = parseMultiplayerMessage(text)
    if (!message)
      return

    const { roomId } = message
    const rooms = peerRooms.get(peer.id) ?? new Set<string>()

    // Authorize once per (peer, room): later frames of a member skip the hook.
    let authorizedUserId: string | undefined
    if (!rooms.has(roomId)) {
      const joined = await join(peer, roomId)
      if (!joined)
        return
      authorizedUserId = joined.userId
      rooms.add(roomId)
      peerRooms.set(peer.id, rooms)
    }

    // Bind the connection identity on its first frame, then stamp every frame
    // with it: client-supplied ids are never trusted after binding.
    identities.enforce(peer.id, message, authorizedUserId)

    if (!await passesFilter(peer, message))
      return

    const room = registry.getOrCreate(roomId)
    room.broadcast(message, peer.id)
    if (message.type === 'multiplayer:leave') {
      registry.leave(roomId, peer.id)
      rooms.delete(roomId)
    }
  }

  /**
   * Handle a disconnect: remaining members of each room receive a leave frame
   * with the bound identity, so they drop the presence without waiting for
   * their stale timeout. Peers that never sent a frame have no identity and
   * get no leave frame.
   */
  function handleClose(peerId: string): void {
    const identity = identities.get(peerId)
    for (const roomId of peerRooms.get(peerId) ?? []) {
      const room = registry.rooms.get(roomId)
      if (room && identity) {
        room.broadcast({
          type: 'multiplayer:leave',
          roomId,
          userId: identity.userId,
          clientId: identity.clientId,
        }, peerId)
      }
    }
    registry.leaveAll(peerId)
    peerRooms.delete(peerId)
    identities.forget(peerId)
    rateLimiter?.forget(peerId)
  }

  return {
    hooks,
    handleMessage,
    handleClose,
  }
}

/** Instance returned by `createMultiplayerServer`. */
export type MultiplayerServer<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer> = ReturnType<typeof createMultiplayerServer<TPeer>>
