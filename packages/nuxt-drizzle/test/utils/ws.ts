/**
 * Shared fakes/helpers for exercising the realtime WebSocket handler
 * (`src/runtime/server/api/realtime.ws`) without a real socket.
 */

export interface FakePeer {
  id: string
  context: Record<string, unknown>
  sent: any[]
  send: (payload: any) => void
  /**
   * Optional close stub. The realtime handler calls this on protocol
   * rejections, so version-negotiation tests need to capture the call.
   */
  close?: (code?: number, reason?: string) => void
}

/** Creates a fake crossws peer that records every sent frame. */
export function makePeer(id = 'peer-1'): FakePeer {
  const sent: any[] = []
  return {
    id,
    context: {},
    sent,
    send: (payload: any) => {
      sent.push(payload)
    },
  }
}

/** Wraps a payload in the message shape the handler reads. */
export function makeMessage(payload: unknown) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return {
    text: () => raw,
    json: () => (typeof payload === 'object' ? payload : JSON.parse(raw)),
  }
}

/**
 * Pulls the websocket hooks out of the h3 `defineWebSocketHandler` wrapper.
 * Must be called after `vi.resetModules()` so state resets between tests.
 */
export async function getWsHooks() {
  const handlerModule = await import('../../src/runtime/server/api/realtime.ws')
  const handler: any = handlerModule.default
  return handler.__websocket__ ?? handler.websocket ?? handler
}

/**
 * Poll a predicate until it returns truthy or the timeout expires. Used in
 * place of arbitrary `setTimeout` sleeps so tests don't flake on slow CI:
 * the assertion runs as soon as the async pubsub fanout + microtask flush
 * lands its frame on the peer.
 */
export async function waitFor<T>(
  predicate: () => T | undefined,
  { timeoutMs = 500, intervalMs = 1 }: { timeoutMs?: number, intervalMs?: number } = {},
): Promise<T> {
  const start = Date.now()
  while (true) {
    const result = predicate()
    if (result) {
      return result
    }
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`waitFor: predicate did not become truthy within ${timeoutMs}ms`)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

/**
 * Asserts that nothing matching `predicate` arrives within the settle
 * window. Use to verify the *absence* of a frame after the async pubsub
 * pipeline has had time to flush — pairs with `waitFor` for positive cases.
 */
export async function expectNoMatch<T>(
  predicate: () => T | undefined,
  { settleMs = 50 }: { settleMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + settleMs
  while (Date.now() < deadline) {
    if (predicate()) {
      throw new Error('expectNoMatch: predicate matched unexpectedly')
    }
    await new Promise(r => setTimeout(r, 5))
  }
}
