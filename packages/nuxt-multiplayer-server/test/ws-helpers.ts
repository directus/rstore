import type { Peer } from 'crossws'
import type { MultiplayerServerHandlerOptions } from '../src/runtime/server/ws-handler'
import { createMultiplayerWebSocketHandler } from '../src/runtime/server/ws-handler'

/** crossws hook surface exposed by the real h3 handler. */
export interface WsHooks {
  /** Checks an upgrade request before opening its connection. */
  upgrade: (request: { url: string, headers: Headers }) => Promise<Response | void> | Response | void
  /** Processes one transport frame. */
  message: (peer: Peer, message: { text: () => string }) => Promise<void>
  /** Releases a disconnected connection. */
  close: (peer: Peer) => void
}

/** Transport peer capturing independent JSON payloads delivered by production. */
export function makePeer(id: string): Peer & { received: any[] } {
  const received: any[] = []
  return {
    id,
    send: (payload: unknown) => {
      received.push(typeof payload === 'string' ? JSON.parse(payload) : payload)
      return 0
    },
    received,
  } as unknown as Peer & { received: any[] }
}

/** Creates production hooks with a fresh room graph for each scenario. */
export function makeHandler(options: Partial<MultiplayerServerHandlerOptions> = {}): WsHooks {
  const handler = createMultiplayerWebSocketHandler({
    maxRoomSize: 10,
    maxMessageBytes: 64 * 1024,
    rateLimit: null,
    ...options,
  })
  return (handler as any).__websocket__ as WsHooks
}

/** Encodes input at the same text boundary used by crossws messages. */
export function frame(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload)
  return { text: () => text }
}

/** Builds a valid presence frame with distinct user and connection identities. */
export function presence(roomId: string, userId: string, clientId: string) {
  return frame({
    type: 'multiplayer:presence',
    roomId,
    clientId,
    user: { id: userId, name: userId, color: '#fff' },
  })
}

/** Observes completion and handles rejection immediately without replacing the original promise. */
export function observeSettlement(promise: Promise<unknown>): () => boolean {
  let settled = false
  void promise.then(
    () => { settled = true },
    () => { settled = true },
  )
  return () => settled
}
