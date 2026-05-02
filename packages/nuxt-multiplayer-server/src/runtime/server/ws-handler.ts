import type { Peer } from 'crossws'
import type { RoomPeer } from './rooms'
import { defineWebSocketHandler } from 'h3'
import { parseMultiplayerMessage } from './guards'
import { rstoreMultiplayerServerHooks } from './hooks'
import { PeerRateLimiter } from './rateLimit'
import { RoomRegistry } from './rooms'

/** Server-side module options baked in at module setup time. */
export interface MultiplayerServerHandlerOptions {
  maxRoomSize: number
  maxMessageBytes: number
  rateLimit: { capacity: number, refillPerSecond: number } | null
}

/** Rooms each peer belongs to. Used on disconnect to clean up membership. */
const peerRooms = new Map<string, Set<string>>()

/** User id tied to the peer — set from the first presence/update frame. */
const peerUserIds = new Map<string, string>()

/**
 * Build the crossws-compatible WebSocket handler. Wires in the shared
 * registry + hooks so all requests against `/api/rstore-multiplayer/ws`
 * (or whatever path the module registers) share a single room graph.
 */
export function createMultiplayerWebSocketHandler(options: MultiplayerServerHandlerOptions) {
  const registry = new RoomRegistry({ maxRoomSize: options.maxRoomSize })
  const rateLimiter = options.rateLimit
    ? new PeerRateLimiter(options.rateLimit)
    : null

  function asRoomPeer(peer: Peer): RoomPeer {
    return {
      id: peer.id,
      send: (payload) => {
        peer.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
      },
    }
  }

  return defineWebSocketHandler({
    async message(peer, message) {
      const text = message.text()
      if (text.length > options.maxMessageBytes) {
        return
      }

      if (rateLimiter && !rateLimiter.consume(peer.id)) {
        return
      }

      const parsed = parseMultiplayerMessage(text)
      if (!parsed) {
        return
      }

      const { roomId } = parsed
      const rooms = peerRooms.get(peer.id) ?? new Set<string>()
      const alreadyInRoom = rooms.has(roomId)

      // Authorize once per (peer, room). Subsequent frames for the same
      // room bypass the hook — the authorize result is cached implicitly
      // via the peer's room membership.
      if (!alreadyInRoom) {
        let rejected = false
        try {
          await rstoreMultiplayerServerHooks.callHook('multiplayer.authorize', {
            peer,
            roomId,
            reject: () => {
              rejected = true
            },
          })
        }
        catch (error) {
          console.error('[rstore-multiplayer-server] authorize hook threw', error)
          rejected = true
        }
        if (rejected) {
          return
        }

        const room = registry.getOrCreate(roomId)
        if (!room.add(asRoomPeer(peer))) {
          return
        }
        rooms.add(roomId)
        peerRooms.set(peer.id, rooms)
      }

      // Track user id for clean-leave broadcast on disconnect.
      if (parsed.type === 'multiplayer:update' || parsed.type === 'multiplayer:leave') {
        peerUserIds.set(peer.id, parsed.userId)
      }
      else if (parsed.type === 'multiplayer:presence') {
        peerUserIds.set(peer.id, parsed.user.id)
      }

      let filtered = false
      try {
        await rstoreMultiplayerServerHooks.callHook('multiplayer.filter', {
          peer,
          roomId,
          message: parsed,
          reject: () => {
            filtered = true
          },
        })
      }
      catch (error) {
        console.error('[rstore-multiplayer-server] filter hook threw', error)
        filtered = true
      }
      if (filtered) {
        return
      }

      const room = registry.getOrCreate(roomId)
      // Explicit leave — broadcast, then drop membership.
      if (parsed.type === 'multiplayer:leave') {
        room.broadcast(parsed, peer.id)
        registry.leave(roomId, peer.id)
        rooms.delete(roomId)
        return
      }

      room.broadcast(parsed, peer.id)
    },

    close(peer) {
      const rooms = peerRooms.get(peer.id)
      if (rooms && rooms.size > 0) {
        const userId = peerUserIds.get(peer.id)
        for (const roomId of rooms) {
          const room = registry.rooms.get(roomId)
          if (!room) {
            continue
          }
          // Synthesize a leave frame so remaining peers drop the presence
          // entry promptly instead of waiting for the client-side stale
          // timeout. Skipped when we never learned the user id (pre-first
          // frame disconnect) — the stale timeout will handle it.
          if (userId) {
            room.broadcast({
              type: 'multiplayer:leave',
              roomId,
              userId,
            }, peer.id)
          }
        }
      }
      registry.leaveAll(peer.id)
      peerRooms.delete(peer.id)
      peerUserIds.delete(peer.id)
      rateLimiter?.forget(peer.id)
    },

    error(_peer, error) {
      console.error('[rstore-multiplayer-server] ws error', error)
    },
  })
}
