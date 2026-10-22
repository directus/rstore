import { createCoreStack } from '#test-utils/store/coreStack'
import { defineModule, findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { createRstoreDevtools } from '../src/runtime'
import { createVueDevtoolsAdapter } from '../src/vue/adapter'

describe('bounded public inspection', () => {
  // User requests second filtered page from an intentionally unsorted dataset.
  // Pagination-before-filter or loss of 0/empty/numeric key distinctions fails.
  it('filters before deterministic paging and keeps public key types', async () => {
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos', getKey: item => item.id }],
      data: { todos: [{ id: 'z', title: 'Match' }, { id: 'a', title: 'Exclude' }, { id: 0, title: 'Match' }, { id: '', title: 'Match' }] },
    })
    await findMany({ store: stack.store, collection: stack.collection('todos') })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'default' })
    const page = runtime.read({ method: 'rstore:get-cache', target, collection: 'todos', contentSearch: 'Match', page: { offset: 1, limit: 1 } })
    expect(page.data.total).toBe(4)
    expect(page.data.matchingTotal).toBe(3)
    expect(page.data.rows.map((row: any) => row.key)).toEqual([0])
    const all = runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' })
    expect(all.data.rows.map((row: any) => row.key)).toEqual(['', 0, 'a', 'z'])
    expect(runtime.read({ method: 'rstore:get-history', target }).data.entries).toEqual([])
    const remoteCount = stack.remote.callCount('fetchMany')
    runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' })
    expect(stack.remote.callCount('fetchMany')).toBe(remoteCount)
    expect(() => runtime.read({ method: 'rstore:get-cache', target, collection: 'todos', page: { limit: 501 } })).toThrow('Invalid read arguments')
  })

  it('reports unavailable custom cache without inspecting private data', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    // Supported extension boundary: omit optional public inspection capability.
    Object.defineProperty(stack.cache, 'inspect', { value: undefined })
    Object.defineProperty(stack.cache, '_private', {
      get() {
        throw new Error('Private cache read')
      },
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'custom' })
    expect(runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' })).toMatchObject({ data: null, unavailable: 'Cache does not expose public inspection', truncated: false })
  })

  it('observes actual Core modules only while consumers retain observation leases', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const useCounter = defineModule(stack.store, 'counter', ({ defineState }) => ({ counter: defineState({ value: 0 }) }))
    const module = await useCounter()
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'default' })
    const read = () => JSON.stringify(runtime.read({ method: 'rstore:get-modules', target }).data)
    expect(read()).toContain('counter')
    let invalidations = 0
    const stopFirst = runtime.subscribe(() => {
      invalidations++
    }, target, 'modules')
    const stopSecond = runtime.subscribe(() => {
      invalidations++
    }, target, 'modules')
    onTestFinished(stopFirst)
    onTestFinished(stopSecond)
    stopFirst()
    module.counter.value = 7
    await vi.waitFor(() => expect(invalidations).toBe(1), { timeout: 1500 })
    expect(read()).toContain('7')
    stopSecond()
    module.counter.value = 8
    await new Promise(resolve => setTimeout(resolve, 350))
    expect(invalidations).toBe(1)
    expect(read()).toContain('8')
  })

  it('refreshes a subscribed Vue cache after public layer flags change', async () => {
    const stack = await createCoreStack({ schema: [{ name: 'todos' }] })
    const layer = reactive({ id: 'visible', collectionName: 'todos', state: { row: { id: 'row', title: 'Visible' } }, deletedItems: new Set<string | number>(), optimistic: true, skip: false })
    stack.cache.addLayer(layer)
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'vue', adapter: createVueDevtoolsAdapter() })
    const views: string[] = []
    const release = runtime.subscribe(event => views.push(event.view), target, 'cache')
    onTestFinished(release)
    expect(stack.read('todos', 'row')).toMatchObject({ id: 'row', title: 'Visible' })
    expect(runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' }).data.rows.map((row: any) => row.key)).toEqual(['row'])
    layer.skip = true
    await nextTick()
    await Promise.resolve()
    expect(views).toEqual(['cache'])
    expect(stack.read('todos', 'row'), 'application cache read must agree with effective inspection').toBeUndefined()
    expect(runtime.read({ method: 'rstore:get-cache', target, collection: 'todos' }).data.rows).toEqual([])
    release()
    layer.skip = false
    await nextTick()
    expect(views).toEqual(['cache'])
  })

  it('visits at most 10,000 actual cache candidates and reports incomplete matching totals', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], remote: false })
    const collection = stack.collection('todos')
    const rows = Array.from({ length: 10_001 }, (_, id) => ({ key: id, value: { id, title: `Item ${id}` } }))
    stack.cache.writeItems({ collection, items: rows })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    let visited = 0
    const { target } = runtime.attachStore(stack.store, { id: 'bounded', adapter: {
      readCache(store) {
        const inspection = store.$cache.inspect!()
        return { ...inspection, collections: inspection.collections.map(view => ({
          ...view,
          // Transparent observer of real cache-owned candidate iteration.
          * effectiveRows() {
            for (const row of view.effectiveRows()) {
              visited++
              yield row
            }
          },
        })) }
      },
    } })
    const reply = runtime.read({ method: 'rstore:get-cache', target, collection: 'todos', page: { limit: 1 } })
    expect(visited, 'candidate traversal must stop before looking at row 10,001').toBe(10_000)
    expect(reply).toMatchObject({ truncated: true, data: { total: 10_001, matchingTotal: null, scanTruncated: true } })
    expect(reply.data.rows.map((row: any) => row.key)).toEqual([0])
  })
})
