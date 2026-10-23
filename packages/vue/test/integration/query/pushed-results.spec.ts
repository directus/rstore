import type { CustomHookMeta } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { blogSchema, drainGarbageCollection, queryIds } from '../garbage-collection/utils'

// Missing publication, wrong representation and stale ownership each have visible
// oracles below. Held transport work is always released, even on assertion failure.
describe('pushed live results replace pages without refetching or reviving stale work', () => {
  it('replaces responseRefs membership, retains shared rows, then collects released rows', async () => {
    const { store, run, scope, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const sibling = scope(() => store.todos.query((q: any) => q.first('1')))
    await sibling.result
    const payload = await subscription(payloads)
    remote.seed('todos', [{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Three' }])
    const rows = remote.rows('todos')
    writeRows(store, rows as any)

    expect(payload.setResult!(rows, { meta: { totalCount: 8 } as CustomHookMeta })).toBe('applied')
    expect(query.data.value.map((item: any) => [item.id, item.title])).toEqual([['2', 'Pushed two'], ['3', 'Three']])
    expect(query.meta.value.totalCount).toBe(8)
    expect(remote.callCount('fetchMany')).toBe(1)
    await nextTick()
    expect(store.todos.peekFirst('1')?.title).toBe('One')
    expect(sibling.result.data.value?.title).toBe('One')
    sibling.stop()
    await vi.waitFor(() => expect(store.todos.peekFirst('1')).toBeNull())
    expect(queryIds(query)).toEqual(['2', '3'])
    expect(payload.setResult!([])).toBe('applied')
    await vi.waitFor(() => expect(store.todos.peekMany()).toEqual([]))
  })

  it('publishes no-cache values without writing items and merges metadata', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', meta: { totalCount: 0 } })))
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '2', title: 'Uncached' }], { meta: { totalCount: 1 } as CustomHookMeta })).toBe('applied')
    expect(query.data.value).toEqual([{ id: '2', title: 'Uncached' }])
    expect(store.todos.peekMany()).toEqual([])
    expect(query.meta.value.totalCount).toBe(1)
    expect(payload.setResult!([], { meta: { cursor: 'next' } as CustomHookMeta })).toBe('applied')
    expect(query.meta.value).toMatchObject({ totalCount: 1, cursor: 'next' })
    expect(remote.callCount('fetchMany')).toBe(1)
  })

  it('keeps paginated computed pages cache-driven while updating totalCount', async () => {
    const { store, run, payloads, remote } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, resultMode: 'computed' })))
    await query.fetchMore({ pageIndex: 1 })
    const payload = await subscription(payloads)
    writeRows(store, [{ id: '3', title: 'Three' }])
    payload.setResult!([{ id: '3', title: 'Three' }], { meta: { totalCount: 3 } as CustomHookMeta })
    // A pushed membership must not turn a cache slice into responseRefs.
    expect(query.pages.value.map((page: any) => page.data.map((item: any) => item.id))).toEqual([['1'], ['2']])
    expect(query.meta.value.totalCount).toBe(3)
    expect(remote.callCount('fetchMany')).toBe(2)
  })

  it.each(['responseRefs', 'computed'] as const)('supersedes an initial fetch and completes foreground lanes (%s)', async (resultMode) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    remote.respondNext('fetchMany', () => [{ id: '2', title: 'Stale two' }, { id: '4', title: 'Stale four' }])
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode })))
    try {
      const payload = await subscription(payloads)
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(1))
      expect(query.loading.value).toBe(true)
      const lanePromise = query.foreground.promise
      writeRows(store, [{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Three' }])
      payload.setResult!([{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Three' }])
      expect(query.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(true)
      expect(query.mainPage.foreground.completed).toBe(true)
      expect(query.foreground.lastUpdated.value).toBeTypeOf('number')
      expect(query.mainPage.foreground.lastUpdated).toBeTypeOf('number')
      await lanePromise
    }
    finally {
      release()
      await query
    }
    await nextTick()
    expect(query.data.value.map((item: any) => [item.id, item.title])).toEqual([['2', 'Pushed two'], ['3', 'Three']])
    expect(store.todos.peekFirst('4')).toBeNull()
    expect(query.error.value).toBeNull()
    expect(query.foreground.completed.value).toBe(true)
  })

  it('collects tracking from a response written before the push superseded it', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      data: { todos: [{ id: '2', title: 'Stale two' }, { id: '4', title: 'Stale four' }] },
    })
    const release = remote.holdNext('fetchRelations')
    const query = run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', include: {} })))
    try {
      const payload = await subscription(payloads)
      await vi.waitFor(() => expect(remote.callCount('fetchRelations')).toBe(1))
      expect(store.todos.peekFirst('4')?.title).toBe('Stale four')
      writeRows(store, [{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Three' }])
      payload.setResult!([{ id: '2', title: 'Pushed two' }, { id: '3', title: 'Three' }])
    }
    finally {
      release()
      await query
    }
    await drainGarbageCollection()
    expect(store.todos.peekFirst('4')).toBeNull()
    expect(query.data.value.map((item: any) => [item.id, item.title])).toEqual([['2', 'Pushed two'], ['3', 'Three']])
  })

  it('retains included targets of pushed rows and releases old relation ownership', async () => {
    const { store, scope, payloads, cache } = await setupLiveTodos({
      schema: blogSchema,
      data: { posts: [{ id: 'p1', authorId: 'a1' }], authors: [{ id: 'a1', name: 'Ada' }] },
    })
    const owner = scope(() => store.posts.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', include: { author: true } })))
    const query = await owner.result
    const payload = await subscription(payloads)
    store.$cache.writeItem({ collection: store.$collections[0], key: 'a2', item: { id: 'a2', name: 'Bob' } })
    store.$cache.writeItem({ collection: store.$collections[1], key: 'p2', item: { id: 'p2', authorId: 'a2' } })
    payload.setResult!([{ id: 'p2', authorId: 'a2' }])
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((post: any) => [post.id, post.author?.name])).toEqual([['p2', 'Bob']])
    expect(store.posts.peekFirst('p1')).toBeNull()
    expect(store.authors.peekFirst('a1')).toBeNull()
    owner.stop()
    await drainGarbageCollection()
    expect(store.posts.peekMany()).toEqual([])
    expect(store.authors.peekMany()).toEqual([])
  })

  it('settles only the pushed page while another page remains loading', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 })))
    const payload = await subscription(payloads)
    const release = remote.holdNext('fetchMany', { count: 2 })
    const refresh = query.refresh({ pages: [0] })
    const more = query.fetchMore({ pageIndex: 1 })
    try {
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(3))
      payload.setResult!([{ id: '1', title: 'Pushed one' }])
      expect(query.mainPage.loading).toBe(false)
      expect(more.page.loading).toBe(true)
      expect(query.foreground.loading.value).toBe(true)
      expect(query.foreground.completed.value).toBe(false)
    }
    finally {
      release()
      await Promise.all([refresh, more])
    }
    expect(query.data.value.map((item: any) => item.title)).toEqual(['Pushed one', 'Two'])
    expect(query.foreground.loading.value).toBe(false)
    expect(query.foreground.completed.value).toBe(true)
    await query.refresh()
    expect(query.data.value.map((item: any) => item.title)).toEqual(['One', 'Two'])
    expect(query.foreground.completed.value).toBe(true)
  })

  it('supersedes background revalidation and ignores its later failure', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    writeRows(store, [{ id: '1', title: 'Cached one' }])
    const release = remote.holdNext('fetchMany')
    let rejected = false
    remote.on('fetchMany', () => {
      rejected = true
      throw new Error('stale background failure')
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'cache-and-fetch', resultMode: 'responseRefs' })))
    const backgroundPromise = query.background.promise
    try {
      const payload = await subscription(payloads)
      expect(query.background.loading.value).toBe(true)
      writeRows(store, [{ id: '2', title: 'Pushed two' }])
      payload.setResult!([{ id: '2', title: 'Pushed two' }])
      expect(query.background.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(true)
    }
    finally {
      release()
      await backgroundPromise
    }
    await vi.waitFor(() => expect(rejected).toBe(true))
    await drainGarbageCollection()
    expect(queryIds(query)).toEqual(['2'])
    expect(query.error.value).toBeNull()
    expect(query.background.error.value).toBeNull()
  })

  it.each([false, true])('waits for the main page without publishing after disposal (%s)', async (dispose) => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache', pageSize: 1 }), { pages: 'all' }))
    const query = owner.result
    const page = query.getPage({ pageIndex: 1 })
    try {
      await vi.waitFor(() => expect(payloads.some(payload => payload.pageIndex === 1)).toBe(true))
      const secondary = payloads.find(payload => payload.pageIndex === 1)!
      expect(secondary.setResult!([{ id: '3', title: 'Three' }], { meta: { totalCount: 3 } as CustomHookMeta })).toBe('applied')
      await nextTick()
      expect(page.data).toEqual([])
      if (dispose)
        owner.stop()
    }
    finally {
      release()
      await query
    }
    if (dispose) {
      await drainGarbageCollection()
      expect(page.data).toEqual([])
      expect(query.meta.value.totalCount).toBeUndefined()
      return
    }
    await vi.waitFor(() => expect(page.data).toEqual([{ id: '3', title: 'Three' }]))
    expect(queryIds(query)).toEqual(['1', '3'])
    expect(query.meta.value.totalCount).toBe(3)
  })

  it.each(['disposed', 'disabled', 'changed'] as const)('rejects a callback when subscription is %s, including before queued cleanup', async (reason) => {
    const { store, scope, payloads, remote } = await setupLiveTodos()
    const enabled = ref(true)
    const where = ref({ title: 'One' })
    const { result, stop } = scope(() => store.todos.liveQuery((q: any) => q.many({
      enabled: enabled.value,
      params: { where: where.value },
      fetchPolicy: 'no-cache',
    })))
    await result
    const payload = await subscription(payloads)
    if (reason === 'disposed')
      stop()
    if (reason === 'disabled')
      enabled.value = false
    if (reason === 'changed')
      where.value = { title: 'Two' }
    expect(payload.setResult!([{ id: '9', title: 'Inactive' }], { meta: { rejected: true } as CustomHookMeta })).toBe('inactive')
    await nextTick()
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(reason === 'changed' ? 1 : 0))
    expect(payload.setResult!([], { meta: { rejected: true } as CustomHookMeta })).toBe('inactive')
    expect(result.meta.value.rejected).toBeUndefined()
    expect(store.todos.peekFirst('9')).toBeNull()
    expect(result.data.value.some((item: any) => item.id === '9')).toBe(false)
    if (reason === 'changed') {
      const current = await subscription(payloads, 1)
      expect(current.setResult!([{ id: '2', title: 'Current' }])).toBe('applied')
      expect(result.data.value).toEqual([{ id: '2', title: 'Current' }])
    }
  })

  it('publishes null to a keyed first query while leaving deletion to connector', async () => {
    const { store, run, payloads, remote } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const payload = await subscription(payloads)
    expect(payload.setResult!(null)).toBe('applied')
    expect(query.data.value).toBeNull()
    expect(store.todos.peekFirst('1')?.title).toBe('One')
    expect(remote.callCount('fetchFirst')).toBe(1)
  })

  it('gives plain subscriptions neither a result publisher nor a refresh, as they have no query', async () => {
    const { store, run, payloads } = await setupLiveTodos()
    run(() => store.todos.subscribe())
    const payload = await subscription(payloads)
    expect(payload.setResult).toBeUndefined()
    expect(payload.refresh).toBeUndefined()
  })
})
