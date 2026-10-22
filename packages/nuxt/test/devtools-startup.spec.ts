import type { App } from 'vue'
import { applyPlugin, createNuxtApp } from 'nuxt/app'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { createLifecycleRenderer } from '../../../test/utils/vue/lifecycleRenderer'
import { loadClientPlugin } from './utils/clientPlugin'

/** Real Vue renderer owns mount/unmount; no browser or DOM behavior is claimed. */
function createApplication() {
  const renderer = createLifecycleRenderer()
  const app = renderer.createApp({ render: () => null })
  const nuxt = createNuxtApp({
    vueApp: app as App<Element>,
    ssrContext: { url: '/', payload: {}, runtimeConfig: { public: {}, app: { baseURL: '/app/' } } } as any,
  })
  app.mount({})
  onTestFinished(() => {
    app.unmount()
    nuxt._scope.stop()
  })
  return { app, nuxt }
}

describe('nuxt browser diagnostics startup', () => {
  it('preserves application construction failure without starting optional discovery', async () => {
    let requests = 0
    vi.stubGlobal('fetch', async () => {
      requests++
      return new Response('{}', { status: 503 })
    })
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })
    const { server, plugin } = await loadClientPlugin(true)
    onTestFinished(() => server.close())
    const { nuxt } = createApplication()
    await expect(applyPlugin(nuxt, plugin)).rejects.toThrow('Application initialization failed')
    expect(requests).toBe(0)
  })

  // Real entry, Vue lifecycle and store; only optional external HTTP is held.
  // Before fix, setup never publishes store until bootstrap reply is released.
  it('publishes usable store while bootstrap waits, then aborts HTTP on real unmount', async () => {
    const response = createDeferred<Response>()
    const requested = createDeferred<AbortSignal | undefined>()
    vi.stubGlobal('fetch', (url: string, options: RequestInit) => {
      expect(url).toBe('/app/inspect/bootstrap.json')
      requested.resolve(options.signal ?? undefined)
      return response.promise
    })
    onTestFinished(() => {
      response.resolve(new Response('{}', { status: 503 }))
      vi.unstubAllGlobals()
    })
    const { server, plugin } = await loadClientPlugin()
    onTestFinished(() => server.close())
    const { nuxt, app } = createApplication()
    const completed = applyPlugin(nuxt, plugin)
    onTestFinished(async () => {
      response.resolve(new Response('{}', { status: 503 }))
      await completed.catch(() => {})
    })
    await expect(Promise.race([completed.then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('blocked'), 300))])).resolves.toBe('ready')
    const store = (nuxt as any).$rstore
    onTestFinished(() => store.$cache.dispose())
    store.$cache.writeItem({ collection: store.$collections[0], key: 'alive', item: { id: 'alive', title: 'Application ready' } })
    expect(store.$cache.readItem({ collection: store.$collections[0], key: 'alive' })).toEqual({ id: 'alive', title: 'Application ready' })
    const signal = await requested.promise
    expect(signal?.aborted).toBe(false)
    app.unmount()
    expect(signal?.aborted).toBe(true)
    response.resolve(new Response('{}', { status: 503 }))
    expect(store.$cache.readItem({ collection: store.$collections[0], key: 'alive' })).toEqual({ id: 'alive', title: 'Application ready' })
  })
})
