import { describe, expect, it, vi } from 'vitest'
import { createObservedStore } from './extensionPoints'

describe('cacheBeforeWriteItem: replacing and dropping writes', () => {
  it('stores the value from setValue and indexes relations from it', async () => {
    const { store, cache, authors, posts } = await createObservedStore()
    store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => {
      if (payload.collection.name === 'posts' && payload.key === 'p1') {
        payload.setValue({ ...payload.existing, ...payload.incoming, authorId: 'a2' })
      }
      if (payload.collection.name === 'authors') {
        payload.setValue({ ...payload.incoming, name: 'Replaced' })
      }
    })
    cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1', title: 'One', authorId: 'a1' } })
    cache.writeItem({ collection: authors, key: 'a1', item: { id: 'a1' } })
    // The children's hook calls must not override the parent's replacement.
    cache.writeItem({ collection: authors, key: 'a2', item: { id: 'a2', posts: [{ id: 'p2', authorId: 'a2' }] } })

    expect(store.posts.peekFirst('p1')).toMatchObject({ title: 'One', authorId: 'a2' })
    expect(store.authors.peekFirst('a2').name).toBe('Replaced')
    expect(store.authors.peekFirst('a1').posts).toEqual([])
    expect(store.authors.peekFirst('a2').posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])
  })

  it('skip() leaves state, markers and relation children untouched and emits no afterCacheWrite', async () => {
    const { store, cache, authors } = await createObservedStore()
    cache.writeItem({ collection: authors, key: 'a1', item: { id: 'a1', name: 'Ada' } })
    const afterCacheWrite = vi.fn()
    store.$hooks.hook('afterCacheWrite', afterCacheWrite)
    store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => {
      if (payload.collection.name === 'authors') {
        payload.skip()
      }
    })

    cache.writeItem({
      collection: authors,
      key: 'a1',
      item: { id: 'a1', name: 'Changed', posts: [{ id: 'p1', authorId: 'a1' }] },
      marker: 'authors-list',
    })

    expect(store.authors.peekFirst('a1').name).toBe('Ada')
    expect(cache.readItems({ collection: authors, marker: 'authors-list' })).toEqual([])
    expect(store.posts.peekFirst('p1')).toBeNull()
    expect(afterCacheWrite).not.toHaveBeenCalled()
  })

  it('skip() on a delete keeps the row', async () => {
    const { store, cache, posts } = await createObservedStore()
    cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1', title: 'Kept' } })
    store.$hooks.hook('cacheBeforeDeleteItem', (payload: any) => payload.skip())

    cache.deleteItem({ collection: posts, key: 'p1' })

    expect(store.posts.peekFirst('p1')?.title).toBe('Kept')
  })

  it('cannot keep rows removed by clearCollection', async () => {
    const { store, cache, posts, deletes } = await createObservedStore()
    cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1' } })
    store.$hooks.hook('cacheBeforeDeleteItem', (payload: any) => payload.skip())

    cache.clearCollection({ collection: posts })

    expect(store.posts.peekFirst('p1')).toBeNull()
    expect(deletes).toEqual([])
  })
})

describe('cacheBeforeWriteItem: every write path is intercepted', () => {
  it('runs for writeItem, writeItems with per-item metadata, relation children and frozen items', async () => {
    const { store, cache, authors, posts, writes } = await createObservedStore()

    cache.writeItem({ collection: posts, key: 'p0', item: { id: 'p0' }, metadata: { version: 1 } })
    cache.writeItems({
      collection: posts,
      items: [
        { key: 'p1', value: { id: 'p1' }, metadata: { version: 2 } },
        { key: 'p2', value: { id: 'p2' } },
      ],
    })
    cache.writeItem({ collection: authors, key: 'a1', item: { id: 'a1', posts: [{ id: 'p3', authorId: 'a1' }] } })
    cache.writeItem({ collection: posts, key: 'p4', item: Object.freeze({ id: 'p4', title: 'Frozen' }) })

    expect(writes.map(({ key, metadata }) => [key, metadata])).toEqual([
      ['p0', { version: 1 }],
      ['p1', { version: 2 }],
      ['p2', undefined],
      ['a1', undefined],
      ['p3', undefined],
      ['p4', undefined],
    ])
    // Relation fields are split off before the parent hook runs.
    expect(writes[3]!.incoming).toEqual({ id: 'a1' })
    expect(writes[5]!.incoming).toEqual({ id: 'p4', title: 'Frozen' })
    expect(store.posts.peekFirst('p3')).toBeTruthy()
  })

  it('honours setValue for a frozen item', async () => {
    const { store, cache, posts } = await createObservedStore()
    store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => payload.setValue({ ...payload.incoming, title: 'Replaced' }))

    cache.writeItem({ collection: posts, key: 'p1', item: Object.freeze({ id: 'p1', title: 'Frozen' }) })

    expect(store.posts.peekFirst('p1').title).toBe('Replaced')
  })

  it('runs for committed mutation results through applyMutation', async () => {
    const { cache, posts, writes, deletes } = await createObservedStore()

    cache.applyMutation({ collection: posts, mutation: 'create', result: { id: 'p1' }, metadata: { version: 1 } })
    cache.applyMutation({ collection: posts, mutation: 'update', results: [{ id: 'p1' }, { id: 'p2' }], metadata: { version: 2 } })
    cache.applyMutation({ collection: posts, mutation: 'delete', key: 'p2', metadata: { version: 3 } })

    expect(writes.map(({ key, metadata }) => [key, metadata])).toEqual([
      ['p1', { version: 1 }],
      ['p1', { version: 2 }],
      ['p2', { version: 2 }],
    ])
    expect(deletes).toEqual([{ collection: 'posts', key: 'p2', existing: { id: 'p2' }, metadata: { version: 3 } }])
  })
})

describe('cacheBeforeWriteItem: existing follows the queue order', () => {
  it('sees the row produced by the previous queued op across pause() and resume()', async () => {
    const { cache, posts, writes, deletes } = await createObservedStore()
    cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1', title: 'A' } })

    cache.pause()
    cache.writeItem({ collection: posts, key: 'p1', item: { title: 'B' } })
    cache.deleteItem({ collection: posts, key: 'p1' })
    cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1', title: 'C' } })
    expect(writes).toHaveLength(1)
    cache.resume()

    expect(writes.map(write => write.existing)).toEqual([
      undefined,
      { id: 'p1', title: 'A' },
      undefined,
    ])
    expect(deletes.map(entry => entry.existing)).toEqual([{ id: 'p1', title: 'B' }])
  })

  it('sees the previous row when writes are staggered', async () => {
    vi.useFakeTimers()
    try {
      const { cache, posts, writes } = await createObservedStore({ cacheStaggering: 1 })
      cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1', title: 'A' } })
      cache.writeItems({
        collection: posts,
        items: [
          { key: 'p1', value: { id: 'p1', title: 'B' } },
          { key: 'p1', value: { id: 'p1', title: 'C' } },
        ],
      })
      expect(writes).toHaveLength(1)

      vi.advanceTimersByTime(10)
      vi.advanceTimersByTime(10)

      expect(writes.map(write => write.existing?.title)).toEqual([undefined, 'A', 'B'])
    }
    finally {
      vi.useRealTimers()
    }
  })
})
