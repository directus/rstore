import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope } from 'vue'
import { createGarbageCollectionStack, drainGarbageCollection, todoSchema } from './utils'

/** Query ids saved in a cache snapshot, page suffixes removed. */
function savedQueryIds(state: { pageRefs?: Record<string, unknown>, queryMeta: Record<string, unknown> }) {
  return {
    pages: [...new Set(Object.keys(state.pageRefs ?? {}).map(pageId => pageId.slice(0, pageId.lastIndexOf('#'))))],
    meta: Object.keys(state.queryMeta),
  }
}

describe('saved query state retention', () => {
  it('expires saved results of ended queries after their TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [] },
      queryStateRetention: { ttlMs: 1_000 },
    })
    const live = await stack.run(() => stack.store.todos.query((q: any) => q.first('live-miss')))
    const ended = stack.scope(() => stack.store.todos.query((q: any) => q.first('ended-miss')))
    expect((await ended.result).data.value).toBeNull()
    ended.stop()
    const liveOnly = savedQueryIds(stack.cache.getState()).pages.filter(id => id.includes('live-miss'))
    expect(savedQueryIds(stack.cache.getState()).pages).toHaveLength(2)

    // Retention sweeps once a minute.
    vi.advanceTimersByTime(60_000)

    expect(savedQueryIds(stack.cache.getState())).toEqual({ pages: liveOnly, meta: liveOnly })
    expect(live.data.value).toBeNull()
  })

  it('keeps the most recent saved results of ended queries within the size limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [] },
      queryStateRetention: { maxSize: 2 },
    })
    for (const key of ['a', 'b', 'c', 'd']) {
      vi.advanceTimersByTime(1_000)
      const miss = stack.scope(() => stack.store.todos.query((q: any) => q.first(`miss-${key}`)))
      expect((await miss.result).data.value).toBeNull()
      miss.stop()
    }
    await Promise.resolve()

    expect(savedQueryIds(stack.cache.getState()).pages.map(id => JSON.parse(id)[1].key)).toEqual(['miss-c', 'miss-d'])
  })

  it('keeps saved results of ended queries forever when retention is disabled', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [] },
      experimentalGarbageCollection: true,
      queryStateRetention: false,
    })
    const miss = stack.scope(() => stack.store.todos.query((q: any) => q.first('missing')))
    expect((await miss.result).data.value).toBeNull()
    miss.stop()
    const saved = savedQueryIds(stack.cache.getState())

    vi.advanceTimersByTime(24 * 60 * 60_000)
    stack.cache.garbageCollect()

    expect(savedQueryIds(stack.cache.getState())).toEqual(saved)
  })

  it.each([
    { name: 'a server store', isServer: true, sweeps: 0 },
    { name: 'a client store', isServer: false, sweeps: 1 },
  ])('installs $sweeps expiration timer for $name and stops it on dispose', async ({ isServer, sweeps }) => {
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const cleared = vi.spyOn(globalThis, 'clearInterval')
    onTestFinished(() => {
      intervals.mockRestore()
      cleared.mockRestore()
    })
    const stack = await createGarbageCollectionStack({ schema: todoSchema, isServer })
    const handles = intervals.mock.results.map(result => result.value)
    expect(handles).toHaveLength(sweeps)

    stack.cache.dispose()

    expect(cleared.mock.calls.map(([handle]) => handle)).toEqual(handles)
  })

  describe('of mounted cache-first queries', () => {
    /** Fake the clock and sweep timer for one test. */
    function fakeClock() {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      onTestFinished(() => {
        vi.useRealTimers()
      })
    }

    it('keeps them past the TTL when remounted from cache', async () => {
      fakeClock()
      const stack = await createGarbageCollectionStack({ schema: todoSchema, data: { todos: [{ id: '1' }] }, queryStateRetention: { ttlMs: 1_000 } })
      const first = stack.scope(() => stack.store.todos.query((q: any) => q.first('1')))
      await first.result
      first.stop()
      const fetches = stack.remote.callCount('fetchFirst')
      await stack.run(() => stack.store.todos.query((q: any) => q.first('1')))
      expect(stack.remote.callCount('fetchFirst')).toBe(fetches)
      const saved = savedQueryIds(stack.cache.getState())

      vi.advanceTimersByTime(60_000)

      expect(savedQueryIds(stack.cache.getState())).toEqual(saved)
    })

    it('keeps them when other results go over the size limit', async () => {
      const stack = await createGarbageCollectionStack({ schema: todoSchema, data: { todos: [{ id: '1' }, { id: '2' }] }, queryStateRetention: { maxSize: 1 } })
      const first = stack.scope(() => stack.store.todos.query((q: any) => q.first('1')))
      await first.result
      first.stop()
      await stack.run(() => stack.store.todos.query((q: any) => q.first('1')))
      const other = stack.scope(() => stack.store.todos.query((q: any) => q.first('2')))
      await other.result
      other.stop()
      await Promise.resolve()

      expect(savedQueryIds(stack.cache.getState()).pages.map(id => JSON.parse(id)[1].key).sort()).toEqual(['1', '2'])
    })

    it('keeps them past the TTL when hydrated from the server', async () => {
      const server = await createGarbageCollectionStack({ schema: todoSchema, data: { todos: [{ id: '1' }] }, isServer: true })
      await effectScope(true).run(() => server.store.todos.query((q: any) => q.first('1')))
      fakeClock()
      const client = await createGarbageCollectionStack({ schema: todoSchema, data: { todos: [{ id: '1' }] }, queryStateRetention: { ttlMs: 1_000 } })
      hydrate(client.cache, server.cache.getState())
      await client.run(() => client.store.todos.query((q: any) => q.first('1')))
      expect(client.remote.callCount('fetchFirst')).toBe(0)
      const saved = savedQueryIds(client.cache.getState())

      vi.advanceTimersByTime(120_000)

      expect(savedQueryIds(client.cache.getState())).toEqual(saved)
    })
  })

  it('drops metadata with the saved page of an ended query when its rows are collected', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
      experimentalGarbageCollection: true,
    })
    const ended = stack.scope(() => stack.store.todos.query((q: any) => q.many({ params: { where: { id: '1' } } })))
    expect((await ended.result).data.value.map((item: any) => item.id)).toEqual(['1'])
    const live = await stack.run(() => stack.store.todos.query((q: any) => q.many({ params: { where: { id: '2' } } })))
    const before = savedQueryIds(stack.cache.getState())
    expect(before.meta).toHaveLength(2)

    ended.stop()
    await drainGarbageCollection()

    expect(savedQueryIds(stack.cache.getState())).toEqual({ pages: before.pages.slice(1), meta: before.meta.slice(1) })
    expect(live.data.value.map((item: any) => item.id)).toEqual(['2'])
  })

  it('keeps a saved miss for a remount while garbage collection is off', async () => {
    const stack = await createGarbageCollectionStack({ schema: todoSchema, data: { todos: [] } })
    const first = stack.scope(() => stack.store.todos.query((q: any) => q.first('missing')))
    expect((await first.result).data.value).toBeNull()
    first.stop()
    const fetches = stack.remote.callCount('fetchFirst')

    const remounted = await stack.run(() => stack.store.todos.query((q: any) => q.first('missing')))

    expect(remounted.data.value).toBeNull()
    expect(remounted.confirmed.value).toBe(true)
    expect(stack.remote.callCount('fetchFirst')).toBe(fetches)
  })
})
