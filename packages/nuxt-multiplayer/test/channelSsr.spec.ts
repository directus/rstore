import { createNuxtApp } from 'nuxt/app'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useRstoreMultiplayerChannel } from '../src/runtime/composables/useRstoreMultiplayerChannel'

/** Server-render one request whose page opens a multiplayer channel. */
async function renderChannelPage() {
  const app = createSSRApp(defineComponent({
    setup() {
      useRstoreMultiplayerChannel({ roomId: 'room', endpoint: 'ws://localhost/__multiplayer' })
      return () => h('div')
    },
  }))
  const nuxt = createNuxtApp({
    vueApp: app,
    ssrContext: { url: '/', payload: {}, runtimeConfig: { public: {}, app: {} } } as any,
  })
  try {
    await renderToString(app)
  }
  finally {
    nuxt._scope.stop()
  }
}

describe('useRstoreMultiplayerChannel on the server', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Vue never unmounts server-rendered components, so anything a render
  // schedules outlives the request.
  it('leaves no timers behind after server renders', async () => {
    for (let index = 0; index < 5; index++) {
      await renderChannelPage()
    }

    expect(vi.getTimerCount()).toBe(0)
  })
})
