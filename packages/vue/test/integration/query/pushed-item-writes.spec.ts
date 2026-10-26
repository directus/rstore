import type { CustomHookMeta } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'
import { setupLiveTodos, subscription, writeRows } from '../../utils/live-query'
import { blogSchema, drainGarbageCollection } from '../garbage-collection/utils'

// Real subscribe callbacks, cache writes and GC. Only remote transport is fake.
// Missing default writes loses visible rows; eager writes corrupt rejected data.
describe('accepted pushed rows use the fetched result write pipeline', () => {
  it('writes every raw row, retains page ownership through GC, then releases it', async () => {
    const { store, scope, payloads, cache } = await setupLiveTodos()
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const query = await owner.result
    const payload = await subscription(payloads)
    expect(payload.setResult!([{ id: '3', title: 'Three' }, { id: '4', title: 'Four' }])).toBe('applied')
    expect(query.data.value.map((row: any) => row.title)).toEqual(['Three', 'Four'])
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(store.todos.peekMany().map((row: any) => row.id)).toEqual(['3', '4'])
    owner.stop()
    await drainGarbageCollection()
    expect(store.todos.peekMany()).toEqual([])
  })

  it('does not parse or write stale and inactive pushes over existing rows', async () => {
    const { store, scope, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    await owner.result
    const payload = await subscription(payloads)
    const parsed: string[] = []
    store.$hooks.hook('parseItem', ({ item }: any) => {
      parsed.push(item.title)
    })
    payload.setResult!([{ id: '1', title: 'Accepted' }], { version: 5 })
    expect(store.todos.peekFirst('1')?.title).toBe('Accepted')
    expect(payload.setResult!([{ id: '1', title: 'Stale' }, { id: '9', title: 'Rejected' }], { version: 4 })).toBe('stale')
    owner.stop()
    expect(payload.setResult!([{ id: '1', title: 'Inactive' }, { id: '9', title: 'Rejected' }])).toBe('inactive')
    expect(store.todos.peekFirst('1')?.title).toBe('Accepted')
    expect(store.todos.peekFirst('9')).toBeNull()
    expect(parsed).toEqual(['Accepted'])
  })

  it('parses no-cache pushes without changing nonempty shared cache', async () => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    writeRows(store, [{ id: '1', title: 'Cached' }])
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    store.$hooks.hook('parseItem', ({ item }: any) => {
      item.title = item.title.toUpperCase()
    })
    const payload = await subscription(payloads)
    payload.setResult!([{ id: '1', title: 'uncached' }, { id: '9', title: 'nine' }])
    expect(query.data.value.map((row: any) => row.title)).toEqual(['UNCACHED', 'NINE'])
    expect(store.todos.peekFirst('1')?.title).toBe('Cached')
    expect(store.todos.peekFirst('9')).toBeNull()
  })

  it.each(['publish', 'drop'] as const)('delays queued writes until publication (%s)', async (outcome) => {
    const { store, scope, payloads, remote } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const release = remote.holdNext('fetchMany')
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ pageSize: 1, resultMode: 'responseRefs' }), { pages: 'all' }))
    const query = owner.result
    const page = query.getPage({ pageIndex: 1 })
    try {
      const payload = await subscription(payloads, 1)
      expect(payload.setResult!([{ id: '9', title: 'Queued' }])).toBe('applied')
      expect(store.todos.peekFirst('9')).toBeNull()
      if (outcome === 'drop')
        owner.stop()
    }
    finally {
      release()
      await query
    }
    if (outcome === 'publish') {
      await vi.waitFor(() => expect(page.data.map((row: any) => row.title)).toEqual(['Queued']))
      expect(store.todos.peekFirst('9')?.title).toBe('Queued')
    }
    else {
      await nextTick()
      expect(store.todos.peekFirst('9')).toBeNull()
    }
  })

  it('writes and owns embedded include targets with the pushed roots', async () => {
    const { store, run, payloads, cache } = await setupLiveTodos({ schema: blogSchema, data: { posts: [{ id: 'p1', authorId: 'a1' }], authors: [{ id: 'a1', name: 'Ada' }] } })
    const query = await run(() => store.posts.liveQuery((q: any) => q.many({ resultMode: 'responseRefs', include: { author: true } })))
    const payload = await subscription(payloads)
    payload.setResult!([{ id: 'p2', authorId: 'a2', author: { id: 'a2', name: 'Bob' } }])
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((row: any) => [row.id, row.author?.name])).toEqual([['p2', 'Bob']])
    expect(store.authors.peekFirst('a2')?.name).toBe('Bob')
    expect(store.authors.peekFirst('a1')).toBeNull()
    store.authors.writeItem({ id: 'a3', name: 'Cara' })
    store.posts.writeItem({ id: 'p2', authorId: 'a3' })
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((row: any) => row.author?.name)).toEqual(['Cara'])
    expect(store.authors.peekFirst('a2')).toBeNull()
  })

  it('passes shared and per-row field timestamps through LWW writes', async () => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    payload.setResult!([{ id: '3', title: 'Three' }, { id: '4', title: 'Four' }], { fieldTimestamps: { title: 10 } })
    payload.setResult!([{ id: '3', title: 'Old' }, { id: '4', title: 'New four' }], { fieldTimestamps: [{ title: 9 }, { title: 11 }] })
    expect(query.data.value.map((row: any) => row.title)).toEqual(['Three', 'New four'])
    expect(store.$cache.readFieldTimestamps({ collectionName: 'todos', key: '3' })).toMatchObject({ title: 10 })
    expect(store.$cache.readFieldTimestamps({ collectionName: 'todos', key: '4' })).toMatchObject({ title: 11 })
  })

  it.each([false, true])('drops superseded paused writes and retains current rows (GC: %s)', async (experimentalGarbageCollection) => {
    const { store, run, payloads, cache } = await setupLiveTodos({ experimentalGarbageCollection })
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    cache.pause()
    try {
      payload.setResult!([{ id: '9', title: 'Old' }])
      payload.setResult!([{ id: '3', title: 'Current' }])
    }
    finally {
      cache.resume()
    }
    expect(store.todos.peekFirst('9')).toBeNull()
    expect(query.data.value.map((row: any) => row.title)).toEqual(['Current'])
    if (experimentalGarbageCollection) {
      await drainGarbageCollection()
      cache.garbageCollect()
      expect(query.data.value.map((row: any) => row.title)).toEqual(['Current'])
    }
  })

  it('retains an existing keyed row after a paused push updates it', async () => {
    const { store, run, payloads, cache } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const payload = await subscription(payloads)
    cache.pause()
    try {
      payload.setResult!({ id: '1', title: 'Current' })
    }
    finally {
      cache.resume()
    }
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value?.title).toBe('Current')
  })

  it('writes keyed first results but null does not delete cached items', async () => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const payload = await subscription(payloads)
    payload.setResult!({ id: '1', title: 'Pushed one' })
    expect(query.data.value?.title).toBe('Pushed one')
    payload.setResult!(null)
    expect(query.data.value).toBeNull()
    expect(store.todos.peekFirst('1')?.title).toBe('Pushed one')
  })

  it.each(['parse', 'cache'] as const)('a nested push during %s supersedes remaining outer writes and metadata', async (boundary) => {
    const { store, run, payloads, cache } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({ resultMode: 'responseRefs' })))
    const payload = await subscription(payloads)
    /** Reenter through the public callback with a newer snapshot. */
    const publishInner = () => payload.setResult!([{ id: '1', title: 'Inner' }], { version: 6, meta: { totalCount: 1 } as CustomHookMeta })
    if (boundary === 'parse') {
      store.$hooks.hook('parseItem', ({ item }: any) => {
        if (item.title === 'Outer')
          publishInner()
      })
    }
    else {
      run(() => watch(() => store.todos.peekFirst('1')?.title, (title) => {
        if (title === 'Outer')
          publishInner()
      }, { flush: 'sync' }))
    }
    payload.setResult!([{ id: '1', title: 'Outer' }, { id: '9', title: 'Abandoned' }], { version: 5, meta: { totalCount: 9 } as CustomHookMeta })
    await drainGarbageCollection()
    cache.garbageCollect()
    expect(query.data.value.map((row: any) => [row.id, row.title])).toEqual([['1', 'Inner']])
    expect(query.meta.value.totalCount).toBe(1)
    expect(store.todos.peekFirst('9')).toBeNull()
  })
})
