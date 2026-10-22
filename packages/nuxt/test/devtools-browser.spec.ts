import { findMany } from '@rstore/core'
import { createStore } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { createFakeRemote } from '../../../test/utils/store/fakeRemote'
import { createNuxtBrowserDevtools } from '../src/runtime/devtools/browser'

/** Same-origin bootstrap service configuration; empty relay URL selects in-page hosting. */
const bootstrap = { protocolVersion: 1, baseURL: '', authToken: 'browser-role' }
/** Application options remain independent of diagnostic ownership. */
const options = { base: '/inspect/', readOnly: true }

/** Create through public Vue entry as Nuxt does; reuse shared external backend. */
async function createApplicationStore(rows: Array<Record<string, unknown>>) {
  const remote = createFakeRemote({ data: { todos: rows } })
  const store = await createStore({ schema: [{ name: 'todos' }], plugins: [remote.plugin], syncImmediately: false, tombstoneGc: false })
  onTestFinished(() => store.$cache.dispose())
  return store
}

describe('optional Nuxt browser registration', () => {
  // Actual store/runtime/adapter execute; only external bootstrap HTTP is substituted.
  // Preserved cache and future operation evidence reject missing or premature attachment.
  it('attaches existing store after discovery without changing cached application state', async () => {
    const store = await createApplicationStore([{ id: 'existing', title: 'Before diagnostics' }])
    await findMany({ store, collection: store.$collections[0]! })
    const response = createDeferred<Response>()
    vi.stubGlobal('fetch', (url: string, request: RequestInit) => {
      expect(url).toBe('/app/inspect/bootstrap.json')
      expect(request.credentials).toBe('same-origin')
      return response.promise
    })
    onTestFinished(() => {
      response.resolve(Response.json(bootstrap))
      vi.unstubAllGlobals()
    })
    const pending = createNuxtBrowserDevtools(options, store, '/app/')
    response.resolve(Response.json(bootstrap))
    const handle = await pending
    onTestFinished(handle.dispose)
    const target = handle.runtime.listStores()[0]!.target
    expect(handle.runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' }).data.rows).toEqual([
      { key: 'existing', value: { kind: 'object', entries: [['id', 'existing'], ['title', 'Before diagnostics']] } },
    ])
    expect(handle.runtime.read({ method: 'rstore:get-history', target }).data.entries).toEqual([])
    await findMany({ store, collection: store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
    expect(handle.runtime.read({ method: 'rstore:get-history', target }).data.entries.map((entry: { operation: string, phase: string }) => `${entry.operation}:${entry.phase}`)).toContain('fetchMany:complete')
    expect(store.$cache.readItem({ collection: store.$collections[0]!, key: 'existing' })).toEqual({ id: 'existing', title: 'Before diagnostics' })
    handle.dispose()
    expect(handle.runtime.listStores()).toEqual([])
    await findMany({ store, collection: store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
    expect(store.$cache.readItem({ collection: store.$collections[0]!, key: 'existing' })).toEqual({ id: 'existing', title: 'Before diagnostics' })
  })

  // A held response body ignores abort, exposing cancellation races beyond fetch itself.
  it('settles cancellation while response body remains pending', async () => {
    const store = await createApplicationStore([])
    const body = createDeferred<typeof bootstrap>()
    const reading = createDeferred<void>()
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json() {
        reading.resolve()
        return body.promise
      },
    }))
    onTestFinished(() => {
      body.resolve(bootstrap)
      vi.unstubAllGlobals()
    })
    const controller = new AbortController()
    const pending = createNuxtBrowserDevtools(options, store, '/', controller.signal)
    await reading.promise
    const failure = new Error('Application departed')
    controller.abort(failure)
    await expect(pending).rejects.toBe(failure)
    body.resolve(bootstrap)
    await body.promise
    await findMany({ store, collection: store.$collections[0]! })
    expect(store.$cache.readItems({ collection: store.$collections[0]! })).toEqual([])
  })

  it('ends hung response body at deadline while application store remains usable', async () => {
    const store = await createApplicationStore([{ id: 'alive', title: 'Independent' }])
    const body = createDeferred<typeof bootstrap>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', async (_url: string, request: RequestInit) => {
      signal = request.signal ?? undefined
      return { ok: true, json: () => body.promise }
    })
    onTestFinished(() => {
      body.resolve(bootstrap)
      vi.unstubAllGlobals()
    })
    const pending = createNuxtBrowserDevtools(options, store)
    await findMany({ store, collection: store.$collections[0]! })
    expect(store.$cache.readItem({ collection: store.$collections[0]!, key: 'alive' })).toEqual({ id: 'alive', title: 'Independent' })
    await expect(pending).rejects.toThrow('rstore devtools bootstrap timed out')
    expect(signal?.aborted).toBe(true)
    expect(store.$cache.readItem({ collection: store.$collections[0]!, key: 'alive' })).toEqual({ id: 'alive', title: 'Independent' })
  }, 10000)
})
