import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it, vi } from 'vitest'
import { setupTodos } from '../../utils/live-query'

// Real cache serialization, hydration, queries and default resolution execute
// against the shared fake backend. Saved response identities must match the
// effective options, including resolved find defaults and overrides omitted
// from the base query id, before confirming or displaying those rows: matching
// raw options cannot identify differing defaults.
describe('saved page references follow effective options', () => {
  it.each([false, true])('reuses hydrated refs only for matching default params (changed: %s)', async (changed) => {
    const server = await setupTodos({ isServer: true, findDefaults: { params: { where: { id: '1' } } } })
    const source = await server.run(() => server.store.todos.query((q: any) => q.many({ resultMode: 'responseRefs' })))
    expect(source.data.value.map((item: any) => item.id)).toEqual(['1'])

    const client = await setupTodos({ findDefaults: { params: { where: { id: changed ? '2' : '1' } } } })
    hydrate(client.cache, server.cache.getState())
    const restored = await client.run(() => client.store.todos.query((q: any) => q.many({ resultMode: 'responseRefs' })))

    expect(restored.data.value.map((item: any) => item.id)).toEqual(changed ? ['2'] : ['1'])
    expect(restored.mainPage.data.map((item: any) => item.id)).toEqual(changed ? ['2'] : ['1'])
    expect(restored.confirmed.value).toBe(true)
    expect(client.remote.callCount('fetchMany')).toBe(changed ? 1 : 0)
    if (changed)
      expect(client.remote.lastRequest('fetchMany')!.findOptions.params).toEqual({ where: { id: '2' } })
  })

  it.each(['initial', 'refresh', 'background'] as const)('retains actual request defaults during a held %s fetch', async (mode) => {
    const { store, run, remote } = await setupTodos({
      findDefaults: { params: { where: { id: '1' } } },
      experimentalGarbageCollection: false,
    })
    const fetchPolicy = mode === 'background' ? 'cache-and-fetch' : 'cache-first'
    /** Keep requested policy separate from a forced refresh's transport policy. */
    const createQuery = () => store.todos.query((q: any) => q.many({ resultMode: 'responseRefs', fetchPolicy }))
    let query = mode === 'refresh' ? await run(createQuery) : undefined
    const release = remote.holdNext('fetchMany')
    const work = query ? query.refresh() : query = run(createQuery)
    try {
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(mode === 'refresh' ? 2 : 1))
      store.$findDefaults.params = { where: { id: '2' } }
    }
    finally {
      release()
      await work
      await query.background.promise
    }
    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])

    const restored = run(createQuery)
    expect(restored.data.value.map((item: any) => item.id)).not.toContain('1')
    await restored
    await restored.background.promise
    expect(restored.data.value.map((item: any) => item.id)).toEqual(['2'])
    expect(restored.confirmed.value).toBe(true)
  })

  it.each(['missing', '2'])('does not reuse a refreshed key %s for the original query', async (key) => {
    const server = await setupTodos({ isServer: true })
    const query = await server.run(() => server.store.todos.query((q: any) => q.first({ key: '1', resultMode: 'responseRefs' })))
    expect(query.data.value.id).toBe('1')
    await query.refresh({ key })
    expect(query.data.value?.id ?? null).toBe(key === 'missing' ? null : '2')

    const client = await setupTodos()
    hydrate(client.cache, server.cache.getState())
    expect(client.store.todos.peekFirst('1')?.id).toBe('1')
    const restored = client.run(() => client.store.todos.query((q: any) => q.first({ key: '1', resultMode: 'responseRefs' })))
    if (key !== 'missing')
      expect(restored.data.value?.id).not.toBe(key)
    await restored

    expect(restored.data.value?.id).toBe('1')
    expect(restored.confirmed.value).toBe(false)
    expect(client.remote.callCount('fetchFirst')).toBe(0)
  })

  it('does not restore a secondary page under different page-specific options', async () => {
    const data = { todos: [
      { id: '1', title: 'One', group: 'first' },
      { id: '2', title: 'Two', group: 'first' },
      { id: '3', title: 'Three', group: 'second' },
      { id: '4', title: 'Four', group: 'second' },
    ] }
    const server = await setupTodos({ isServer: true, data })
    const query = await server.run(() => server.store.todos.query((q: any) => q.many({ pageSize: 1, resultMode: 'responseRefs' })))
    const second = await query.fetchMore({ pageIndex: 1, params: { where: { group: 'second' } } })
    expect(second.page.data.map((item: any) => item.id)).toEqual(['4'])

    const client = await setupTodos({ data })
    hydrate(client.cache, server.cache.getState())
    const restored = await client.run(() => client.store.todos.query((q: any) => q.many({ pageSize: 1, resultMode: 'responseRefs' })))
    const page = await restored.fetchMore({ pageIndex: 1, params: { where: { group: 'first' } } })

    expect(page.page.data.map((item: any) => item.id)).toEqual(['2'])
    expect(restored.mainPage.data.map((item: any) => item.id)).toEqual(['1'])
    expect(client.remote.lastRequest('fetchMany')!.findOptions.params).toEqual({ where: { group: 'first' } })
  })
})
