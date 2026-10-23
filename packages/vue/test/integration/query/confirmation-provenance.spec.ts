import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupTodos } from '../../utils/live-query'

// Real query and cache APIs execute; only the shared remote backend is fake.
// Function options are local cache-read callbacks: like the JSON page id, saved
// confirmation follows serializable options only, so inline callbacks rebuilt
// by every options read keep confirmation through refresh, remount and SSR.
describe('saved page confirmation follows serializable options', () => {
  it('stays confirmed while refreshing unchanged inline function options', async () => {
    const { store, run, remote } = await setupTodos()
    const query = await run(() => store.todos.query((q: any) => q.many({ filter: (item: any) => item.id === '1' })))
    expect(query.confirmed.value).toBe(true)
    const release = remote.holdNext('fetchMany')
    const refreshing = query.refresh()
    try {
      expect(query.confirmed.value).toBe(true)
    }
    finally {
      release()
      await refreshing
    }
    expect(query.confirmed.value).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(2)
  })

  it('reuses saved confirmation on remount with a new inline function', async () => {
    const { store, scope, run, remote } = await setupTodos()
    const child = scope(() => store.todos.query((q: any) => q.many({ filter: (item: any) => item.id === '1' })))
    await child.result
    child.stop()
    const query = await run(() => store.todos.query((q: any) => q.many({ filter: (item: any) => item.id === '1' })))

    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(query.confirmed.value).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(1)
  })

  it('re-reads the cache without unconfirming when only a function option changes', async () => {
    const { store, run, remote } = await setupTodos()
    const filter = ref((item: any) => item.id === '1')
    const query = await run(() => store.todos.query((q: any) => q.many({ filter: filter.value })))
    filter.value = (item: any) => item.id === '2'
    await nextTick()
    await query.foreground.promise

    expect(query.data.value.map((item: any) => item.id)).toEqual(['2'])
    expect(query.confirmed.value).toBe(true)
    expect(remote.callCount('fetchMany')).toBe(1)
  })

  it.each(['query options', 'find defaults'] as const)('confirms a hydrated page whose %s hold an inline function', async (source) => {
    /** Each side of the SSR boundary builds its own callback instance. */
    const filter = () => (item: any) => item.id === '1'
    const storeOptions = () => source === 'find defaults' ? { findDefaults: { filter: filter() } } : {}
    const queryOptions = () => source === 'query options' ? { filter: filter() } : {}
    const server = await setupTodos({ isServer: true, ...storeOptions() })
    const rendered = await server.run(() => server.store.todos.query((q: any) => q.many(queryOptions())))
    expect(rendered.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(rendered.confirmed.value).toBe(true)
    const client = await setupTodos(storeOptions())
    hydrate(client.cache, server.cache.getState())
    const query = await client.run(() => client.store.todos.query((q: any) => q.many(queryOptions())))

    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(query.confirmed.value).toBe(true)
    expect(client.remote.callCount('fetchMany')).toBe(0)
  })

  it('unconfirms as soon as serializable options change', async () => {
    const { store, run } = await setupTodos()
    await store.todos.findMany()
    const title = ref('One')
    const query = await run(() => store.todos.query((q: any) => q.many({ pageSize: 10, filter: (item: any) => item.title === title.value, params: { where: { title: title.value } } })))
    expect(query.confirmed.value).toBe(true)
    title.value = 'Two'
    // Data already reads the new options before the reload starts.
    expect(query.data.value.map((item: any) => item.id)).toEqual(['2'])
    expect(query.confirmed.value).toBe(false)
    await nextTick()
    await query.foreground.promise
    expect(query.confirmed.value).toBe(true)
  })
})
