import type { Inspector } from '../app/stores/connection'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { ssrContextKey } from 'vue'
import { createDeferred } from '../../../test/utils/deferred'
import { createLifecycleRenderer } from '../../../test/utils/vue/lifecycleRenderer'

it('ignores old discovery after real App unmount and preserves replacement connection', async () => {
  // Actual SFC setup and Vue mount/unmount execute. Render is omitted because
  // this protects connection lifecycle, not browser presentation. Only external
  // HTTP discovery is held; embedded and relay adapters remain real.
  const cacheDir = await mkdtemp(join(tmpdir(), 'rstore-inspector-app-'))
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    plugins: [vue()],
    cacheDir,
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
  }).catch(async (error) => {
    await rm(cacheDir, { recursive: true, force: true })
    throw error
  })
  const held = createDeferred<Response>()
  const started = createDeferred<void>()
  const finished = createDeferred<void>()
  let requests = 0
  const standalone = { location: { href: 'http://localhost/inspector/' }, parent: null as unknown }
  standalone.parent = standalone
  vi.stubGlobal('window', standalone)
  vi.stubGlobal('fetch', async () => {
    requests++
    if (requests === 1) {
      started.resolve()
      try {
        return await held.promise
      }
      finally { finished.resolve() }
    }
    throw new Error('Old unmounted relay failed')
  })
  let unmount: (() => void) | undefined
  let state: Inspector | undefined
  try {
    const { default: App } = await server.ssrLoadModule('/app/App.vue')
    const { createPinia } = await server.ssrLoadModule('pinia')
    const { useInspector } = await server.ssrLoadModule('/app/stores/connection.ts')
    App.render = () => null
    const renderer = createLifecycleRenderer()
    const pinia = createPinia()
    const app = renderer.createApp(App)
    app.use(pinia)
    app.provide(ssrContextKey, { modules: new Set() })
    state = useInspector(pinia).state
    app.mount({})
    unmount = () => app.unmount()
    await started.promise
    unmount()
    unmount = undefined
    let disposed = false
    await state!.connect({
      listSessions: async () => [],
      subscribe: () => () => {},
      read: async () => { throw new Error('No store') },
      action: async () => { throw new Error('No store') },
      dispose: () => { disposed = true },
    })
    held.resolve(new Response('{}', { status: 200 }))
    await finished.promise
    // HTTP completion is explicit; drain its promise continuations this turn.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(state!.status).toBe('live')
    expect(state!.error).toBe('')
    expect(disposed).toBe(false)
    expect(requests).toBe(1)
  }
  finally {
    held.resolve(new Response('{}', { status: 200 }))
    unmount?.()
    state?.disconnect()
    vi.unstubAllGlobals()
    await server.close()
    await rm(cacheDir, { recursive: true, force: true })
  }
})
