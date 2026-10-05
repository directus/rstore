import type { MultiplayerAllowedOrigins, TokenBucketOptions } from '@rstore/multiplayer/server'
import type { Peer } from 'crossws'
import type { CollabRouteOptions } from './collab-route'
import { createMultiplayerServer, isOriginAllowed } from '@rstore/multiplayer/server'
import { defineWebSocketHandler } from 'h3'
import { createCollabRoute } from './collab-route'
import { rstoreMultiplayerServerHooks } from './hooks'

/** Server-side module options baked in at module setup time. */
export interface MultiplayerServerHandlerOptions {
  maxRoomSize: number
  maxMessageBytes: number
  rateLimit: TokenBucketOptions | null
  /**
   * Origins accepted at upgrade time. `undefined` = same-origin only,
   * `string[]` = same-origin + allowlist, `false` = no check.
   */
  allowedOrigins?: MultiplayerAllowedOrigins
  /** `collab:*` frames (rich-text OT); `null` leaves them to the room server, which drops them. */
  collab?: CollabRouteOptions | null
}

/**
 * Build the crossws WebSocket handler: an h3 adapter over the
 * transport-agnostic `createMultiplayerServer` from
 * `@rstore/multiplayer/server`, sharing the `rstoreMultiplayerServerHooks`
 * registry. The adapter only owns the upgrade checks.
 */
export function createMultiplayerWebSocketHandler(options: MultiplayerServerHandlerOptions) {
  const server = createMultiplayerServer<Peer>({
    hooks: rstoreMultiplayerServerHooks,
    maxRoomSize: options.maxRoomSize,
    maxMessageBytes: options.maxMessageBytes,
    rateLimit: options.rateLimit,
  })
  const collab = options.collab ? createCollabRoute(options.collab) : null
  /** One-shot flag for the missing-authorize-hook warning. */
  let warnedNoAuthorizeHook = false

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

    message(peer, message) {
      const text = message.text()
      return collab?.route(peer, text) ?? server.handleMessage(peer, text)
    },

    close(peer) {
      server.handleClose(peer.id)
      collab?.close(peer.id)
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
