import { findFirst, findMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { setupLiveTodos, subscription } from '../../utils/live-query'
import { blogSchema, drainGarbageCollection } from '../garbage-collection/utils'

// Real query/cache/GC paths; only remote fetch replies are supplied by FakeRemote.
// Local filter changes must retain pushed roots exactly as fetched roots do.
describe('pushed item pipeline review regressions', () => {
  it.each(['fetch', 'push', 'paused push'] as const)('keeps rows leaving a filtered computed page (%s)', async (source) => {
    const { store, run, payloads, cache } = await setupLiveTodos({
      data: { todos: source === 'fetch' ? [{ id: '1', title: 'One', done: false }] : [] },
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 10, filter: (todo: any) => !todo.done })))
    const payload = await subscription(payloads)
    const id = source === 'fetch' ? '1' : '3'
    if (source !== 'fetch') {
      if (source === 'paused push')
        cache.pause()
      try {
        payload.setResult!([{ id, title: 'Three', done: false }])
      }
      finally {
        cache.resume()
      }
    }
    expect(query.data.value.map((row: any) => row.id)).toContain(id)
    store.todos.writeItem({ id, done: true })
    expect(query.data.value).toEqual([])
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(store.todos.peekFirst(id)?.done).toBe(true)
    store.todos.writeItem({ id, done: false })
    expect(query.data.value.map((row: any) => row.id)).toEqual([id])
  })

  it('parses detached copies when connector reuses nested row objects', async () => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    store.$hooks.hook('parseItem', ({ item }: any) => {
      item.title += '!'
      item.details.count++
    })
    const rows = [{ id: '3', title: 'Three', details: { count: 0 } }]
    for (let index = 0; index < 2; index++) {
      payload.setResult!(rows)
      expect(query.data.value.map((row: any) => [row.title, row.details.count])).toEqual([['Three!', 1]])
    }
    expect(rows).toEqual([{ id: '3', title: 'Three', details: { count: 0 } }])
  })

  it('captures queued rows and timestamps before connector mutates them', async () => {
    const { store, scope, payloads, remote } = await setupLiveTodos()
    const release = remote.holdNext('fetchMany')
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, resultMode: 'responseRefs' }), { pages: 'all' }))
    const query = owner.result
    const page = query.getPage({ pageIndex: 1 })
    try {
      const payload = await subscription(payloads, 1)
      const rows = [{ id: '3', title: 'Accepted' }]
      const fieldTimestamps = [{ title: 10 }]
      payload.setResult!(rows, { fieldTimestamps })
      rows[0]!.title = 'Mutated'
      rows.push({ id: '4', title: 'Appended' })
      fieldTimestamps[0]!.title = 1
    }
    finally {
      release()
      await query
    }
    await vi.waitFor(() => expect(page.data.map((row: any) => [row.id, row.title])).toEqual([['3', 'Accepted']]))
    expect(store.$cache.readFieldTimestamps({ collectionName: 'todos', key: '3' })).toMatchObject({ title: 10 })
    expect(store.todos.peekFirst('4')).toBeNull()
  })

  it.each([false, true])('wraps no-cache pushes with item API, computed fields and relations (first: %s)', async (first) => {
    const schema = blogSchema.map(collection => 'name' in collection && collection.name === 'posts'
      ? { ...collection, computed: { label: (item: any) => `${item.id}:${item.author?.name}` } }
      : collection)
    const { store, run, payloads } = await setupLiveTodos({ schema, data: { posts: [] }, experimentalGarbageCollection: false })
    store.authors.writeItem({ id: 'a2', name: 'Bob' })
    const query = await run(() => store.posts.liveQuery((q: any) => first ? q.first({ key: 'p2', fetchPolicy: 'no-cache' }) : q.many({ fetchPolicy: 'no-cache' })))
    const payload = await subscription(payloads)
    const row = { id: 'p2', authorId: 'a2' }
    payload.setResult!(first ? row : [row])
    const item = first ? query.data.value : query.data.value[0]
    expect(item.$collection).toBe('posts')
    expect(item.$getKey()).toBe('p2')
    expect(item.$raw()).toEqual({ id: 'p2', authorId: 'a2' })
    expect(item.author?.name).toBe('Bob')
    expect(item.label).toBe('p2:Bob')
    expect(store.posts.peekFirst('p2')).toBeNull()
  })

  it.each([false, true])('retains deferred included roots and follows later relation moves (existing: %s)', async (existing) => {
    const { store, run, payloads, cache } = await setupLiveTodos({
      schema: blogSchema,
      data: { posts: existing ? [{ id: 'p1', authorId: 'a1' }] : [], authors: [{ id: 'a1', name: 'Ada' }] },
    })
    const query = await run(() => store.posts.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', include: { author: true } })))
    const payload = await subscription(payloads)
    cache.pause()
    try {
      payload.setResult!([{ id: 'p1', authorId: 'a2', author: { id: 'a2', name: 'Bob' } }])
      // Resume on a later turn, after deferred watcher installation has settled.
      await drainGarbageCollection()
    }
    finally {
      cache.resume()
    }
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((row: any) => [row.id, row.author?.name])).toEqual([['p1', 'Bob']])
    expect(store.authors.peekFirst('a1')).toBeNull()
    store.authors.writeItem({ id: 'a3', name: 'Cara' })
    store.posts.writeItem({ id: 'p1', authorId: 'a3' })
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((row: any) => row.author?.name)).toEqual(['Cara'])
    expect(store.authors.peekFirst('a2')).toBeNull()
  })

  it.each([0, 1, 3])('warns about misaligned per-row field timestamps (%s)', async (length) => {
    const { store, run, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      payload.setResult!([{ id: '3', title: 'Three' }, { id: '4', title: 'Four' }], { fieldTimestamps: Array.from({ length }, () => ({ title: 10 })) })
      expect(warning).toHaveBeenCalledWith(`[rstore] fieldTimestamps length must match result rows (received ${length} timestamps for 2 rows).`)
      expect(query.data.value.map((row: any) => row.id)).toEqual(['3', '4'])
    }
    finally {
      warning.mockRestore()
    }
  })

  // Core callers still consume returned values after cancellation. Ownership
  // suppresses cache writes, never parsing/wrapping or complete return values.
  it.each(['many', 'first'] as const)('returns parsed wrapped Core %s results when already cancelled', async (mode) => {
    const { store } = await setupLiveTodos({ experimentalGarbageCollection: false })
    store.$hooks.hook('parseItem', ({ item }: any) => {
      item.title += '!'
    })
    const params = { store, collection: store.$collections[0], findOptions: { fetchPolicy: 'fetch-only' as const }, meta: { $canPublishQuery: () => false } }
    const { result } = mode === 'many' ? await findMany(params) : await findFirst(params)
    const rows = mode === 'many' ? result : [result]
    expect(rows.map((row: any) => [row.$collection, row.title])).toEqual(mode === 'many' ? [['todos', 'One!'], ['todos', 'Two!']] : [['todos', 'One!']])
    expect(store.todos.peekMany()).toEqual([])
  })

  it('returns every parsed Core row if parsing cancels publication', async () => {
    const { store } = await setupLiveTodos({ experimentalGarbageCollection: false })
    let current = true
    store.$hooks.hook('parseItem', ({ item }: any) => {
      item.title += '!'
      current = false
    })
    const { result } = await findMany({ store, collection: store.$collections[0], findOptions: { fetchPolicy: 'fetch-only' }, meta: { $canPublishQuery: () => current } })
    expect(result.map((row: any) => row.title)).toEqual(['One!', 'Two!'])
    expect(store.todos.peekMany()).toEqual([])
  })
})
