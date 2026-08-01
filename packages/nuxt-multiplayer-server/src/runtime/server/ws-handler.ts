import type { Peer } from 'crossws'
import type { MultiplayerAllowedOrigins } from './origin'
import type { RoomPeer } from './rooms'
import { defineWebSocketHandler } from 'h3'
import { parseMultiplayerMessage } from './guards'
import { rstoreMultiplayerServerHooks } from './hooks'
import { PeerIdentityStore } from './identity'
import { isOriginAllowed } from './origin'
import { PeerRateLimiter } from './rateLimit'
import { RoomRegistry } from './rooms'

/** Server-side module options baked in at module setup time. */
export interface MultiplayerServerHandlerOptions {
  maxRoomSize: number
  maxMessageBytes: number
  rateLimit: { capacity: number, refillPerSecond: number } | null
  /**
   * Origins accepted at upgrade time. `undefined` = same-origin only,
   * `string[]` = same-origin + allowlist, `false` = no check.
   */
  allowedOrigins?: MultiplayerAllowedOrigins
}

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
  /** Rooms each peer belongs to. Used on disconnect to clean up membership. */
  const peerRooms = new Map<string, Set<string>>()
  /** Identity bound to each connection — stamps every outbound frame. */
  const identities = new PeerIdentityStore()
  /** One-shot flag for the missing-authorize-hook warning. */
  let warnedNoAuthorizeHook = false

  function asRoomPeer(peer: Peer): RoomPeer {
    return {
      id: peer.id,
      send: (payload) => {
        peer.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
      },
    }
  }

  return defineWebSocketHandler({
    /**
     * Reject cross-site upgrades before the socket opens. Browsers do not
     * apply CORS to WebSocket handshakes, so cookie-authenticated apps
     * would otherwise be exploitable from any third-party page (CSWSH).
     */
    upgrade(request) {
      if (!warnedNoAuthorizeHook && !rstoreMultiplayerServerHooks.hasHook('multiplayer.authorize')) {
        warnedNoAuthorizeHook = true
        console.warn(
          '[rstore-multiplayer-server] No `multiplayer.authorize` hook is registered — '
          + 'every client that can reach the endpoint may join any room. '
          + 'Register a handler via rstoreMultiplayerServerHooks.hook(\'multiplayer.authorize\', ...) in a Nitro plugin.',
        )
      }

      const origin = request.headers.get('origin')
      const host = request.headers.get('host') ?? safeUrlHost(request.url)
      if (!isOriginAllowed(origin, host, options.allowedOrigins)) {
        return new Response('Forbidden: origin not allowed', { status: 403 })
      }
    },

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

      // User id bound by an authorize handler for this join, if any.
      let authorizedUserId: string | undefined

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
            setUserId: (userId: string) => {
              authorizedUserId = userId
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

      // Bind the connection's identity (first frame) and stamp the frame
      // with it — client-supplied userId / user.id / clientId are never
      // trusted after binding, so peers cannot impersonate each other.
      identities.enforce(peer.id, parsed, authorizedUserId)

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
        const identity = identities.get(peer.id)
        for (const roomId of rooms) {
          const room = registry.rooms.get(roomId)
          if (!room) {
            continue
          }
          // Synthesize a leave frame so remaining peers drop the presence
          // entry promptly instead of waiting for the client-side stale
          // timeout. Skipped when we never learned the identity (pre-first
          // frame disconnect) — the stale timeout will handle it.
          if (identity) {
            room.broadcast({
              type: 'multiplayer:leave',
              roomId,
              userId: identity.userId,
              clientId: identity.clientId,
            }, peer.id)
          }
        }
      }
      registry.leaveAll(peer.id)
      peerRooms.delete(peer.id)
      identities.forget(peer.id)
      rateLimiter?.forget(peer.id)
    },

    error(_peer, error) {
      console.error('[rstore-multiplayer-server] ws error', error)
    },
  })
}

/** Extracts the host from a URL string, returning `null` on failure. */
function safeUrlHost(url: string): string | null {
  try {
    return new URL(url).host
  }
  catch {
    return null
  }
}
