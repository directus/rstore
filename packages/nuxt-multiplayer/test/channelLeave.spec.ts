import { afterAll, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, nextTick } from 'vue'

/** Socket calls in call order; proves `leave` reaches the wire before close. */
const wire: string[] = []
/** Sockets created by `useWebSocket`, so the test can open them. */
const sockets: FakeWebSocket[] = []

/** Minimal socket recording what `useWebSocket` sends and when it closes. */
class FakeWebSocket {
  /** Assigned by `useWebSocket`; called by the test to open the socket. */
  onopen: (() => void) | null = null

  /** Register the instance for the test. */
  constructor() {
    sockets.push(this)
  }

  /** Record a frame by its message type. */
  send(data: string) {
    wire.push(JSON.parse(data).type)
  }

  /** Record closure. */
  close() {
    wire.push('close')
  }
}

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('useRstoreMultiplayerChannel scope disposal', () => {
  // Peers otherwise keep a ghost presence until their stale timeout.
  it('sends leave on the open socket before closing it', async () => {
    // VueUse computes `isClient` at import time, so browser globals must exist
    // before VueUse loads. Vue itself was already imported without a DOM.
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('document', {})
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const { createNuxtApp } = await import('nuxt/app')
    const { useRstoreMultiplayerChannel } = await import('../src/runtime/composables/useRstoreMultiplayerChannel')
    // This project compiles Nuxt as server code, which reads runtime config
    // from the SSR context; the browser globals still select VueUse's client path.
    const nuxt = createNuxtApp({
      vueApp: createApp({}),
      ssrContext: { url: '/', payload: {}, runtimeConfig: { public: {}, app: {} } } as any,
    })
    const scope = effectScope()
    nuxt.runWithContext(() => scope.run(() => {
      useRstoreMultiplayerChannel({ roomId: 'room', endpoint: 'ws://localhost/__multiplayer' })
    }))
    sockets[0]!.onopen!()
    // Let the status watcher announce presence on the now-open socket.
    await nextTick()

    scope.stop()
    nuxt._scope.stop()

    expect(wire).toEqual(['multiplayer:presence', 'multiplayer:leave', 'close'])
  })
})
