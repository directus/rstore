import type { VueStack } from '#test-utils/store/vueStack'
import { addCollections } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds, todoSchema } from './utils'

/** Advance just the wall clock, leaving GC under the caller's control. */
function useClock() {
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  return (ms: number) => vi.advanceTimersByTime(ms)
}

/** Read committed keys without resetting their idle age. */
function snapshotKeys(stack: VueStack, collection: string): string[] {
  return Object.keys(stack.cache.getState().collections[collection] ?? {})
}

describe('row garbage collection limits', () => {
  it('retains released rows until their idle TTL and refetches an evicted row', async () => {
    const advance = useClock()
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
      experimentalGarbageCollection: true,
      garbageCollection: { ttlMs: 100 },
      queryStateRetention: false,
    })
    const mount = () => stack.scope(() => stack.store.todos.query((q: any) => q.first('1')))
    const first = mount()
    await first.result
    advance(200)
    first.stop()
    await drainGarbageCollection()

    advance(99)
    stack.cache.garbageCollect()
    const second = mount()
    expect((await second.result).data.value?.id).toBe('1')
    expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(1)
    second.stop()
    await drainGarbageCollection()

    advance(100)
    expect(snapshotKeys(stack, 'todos')).toEqual(['1'])
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    expect((await mount().result).data.value?.id).toBe('1')
    expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(2)
  })

  it('applies collection caps before the shared cap and uses cache lookups for recency', async () => {
    const advance = useClock()
    const stack = await createGarbageCollectionStack({
      schema: [{ name: 'todos', garbageCollection: { maxSize: 1 } }, { name: 'notes' }],
      garbageCollection: { maxSize: 2 },
      remote: false,
    })
    for (const [collection, id] of [['todos', 'keep'], ['notes', 'old'], ['todos', 'drop'], ['notes', 'new']] as const) {
      advance(1)
      stack.cache.writeItem({ collection: stack.collection(collection), key: id, item: { id } })
    }
    advance(1)
    stack.cache.readItems({ collection: stack.collection('todos'), keys: ['keep'] })
    expect(snapshotKeys(stack, 'todos')).toHaveLength(2)

    stack.cache.garbageCollect()

    expect(snapshotKeys(stack, 'todos')).toEqual(['keep'])
    expect(snapshotKeys(stack, 'notes')).toEqual(['new'])
  })

  it('enforces the shared cap when a query releases its rows', async () => {
    const advance = useClock()
    const stack = await createGarbageCollectionStack({
      schema: [{ name: 'todos' }, { name: 'notes' }],
      experimentalGarbageCollection: true,
      garbageCollection: { maxSize: 1 },
      data: { todos: [{ id: 'mounted' }] },
    })
    stack.cache.writeItem({ collection: stack.collection('notes'), key: 'old', item: { id: 'old' } })
    advance(5)
    const query = stack.scope(() => stack.store.todos.query((q: any) => q.first('mounted')))
    await query.result
    query.stop()
    await drainGarbageCollection()

    expect(snapshotKeys(stack, 'notes')).toEqual([])
    expect(snapshotKeys(stack, 'todos')).toEqual(['mounted'])
  })

  it('uses the collection TTL in either direction and seeds age on snapshot restore', async () => {
    const advance = useClock()
    const stack = await createGarbageCollectionStack({
      schema: [
        { name: 'short', garbageCollection: { ttlMs: 50 } },
        { name: 'default' },
        { name: 'long', garbageCollection: { ttlMs: 150 } },
      ],
      garbageCollection: { ttlMs: 100 },
      remote: false,
    })
    const collections = Object.fromEntries(['short', 'default', 'long'].map(name => [name, { 1: { id: 1 } }]))
    stack.cache.setState({ ...stack.cache.getState(), collections })
    for (const remaining of [['default', 'long'], ['long'], []]) {
      advance(50)
      stack.cache.garbageCollect()
      expect(Object.entries(stack.cache.getState().collections)
        .filter(([, rows]) => Object.keys(rows).length)
        .map(([name]) => name)).toEqual(remaining)
    }
  })

  it('keeps mounted and optimistic rows outside the unused budget', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      garbageCollection: { maxSize: 0 },
      data: { todos: [{ id: 'mounted' }] },
    })
    const scope = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
    })))
    const query = await scope.result
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: 'rollback', item: { id: 'rollback', value: 'base' } })
    stack.cache.writeItem({ collection, key: 'unused', item: { id: 'unused' } })
    stack.cache.addLayer({ id: 'delete', collectionName: 'todos', state: {}, deletedItems: new Set(['rollback']) })

    stack.cache.garbageCollect()

    expect(queryIds(query)).toEqual(['mounted'])
    expect(cached(stack, 'todos', 'unused')).toBeUndefined()
    stack.cache.removeLayer('delete')
    expect(cached(stack, 'todos', 'rollback')?.value).toBe('base')
    scope.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', 'mounted')).toBeDefined()
    stack.cache.garbageCollect()
    expect(snapshotKeys(stack, 'todos')).toEqual([])
  })

  it('keeps explicitly retained batch writes outside the unused budget', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      garbageCollection: { maxSize: 0 },
      remote: false,
    })
    const collection = stack.collection('todos')
    stack.cache.writeItems({ collection, items: [{ key: 'retained', value: { id: 'retained' } }], retain: true })
    stack.cache.writeItems({ collection, items: [{ key: 'unused', value: { id: 'unused' } }] })
    stack.cache.garbageCollect()
    expect(snapshotKeys(stack, 'todos')).toEqual(['retained'])
  })

  it('protects rows that enter a mounted computed result after its fetch', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      garbageCollection: { maxSize: 0 },
      data: { todos: [{ id: 'initial' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many()))
    stack.cache.writeItem({
      collection: stack.collection('todos'),
      key: 'later',
      item: { id: 'later' },
    })
    expect(queryIds(query)).toEqual(['initial', 'later'])

    stack.cache.garbageCollect()

    expect(queryIds(query)).toEqual(['initial', 'later'])
  })

  it('drops a released row from its query result even while the cache keeps it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      garbageCollection: { ttlMs: 60_000 },
      experimentalGarbageCollection: true,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many()))
    stack.remote.seed('todos', [{ id: '1' }])
    await query.refresh()
    await drainGarbageCollection()

    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
  })

  it('does not inherit a policy into other collections from a local option', async () => {
    const advance = useClock()
    const stack = await createGarbageCollectionStack({
      schema: [{ name: 'todos', garbageCollection: { ttlMs: 100 } }, { name: 'notes' }],
      remote: false,
    })
    const todos = stack.collection('todos')
    stack.cache.writeItem({ collection: todos, key: 1, item: { id: 1 } })
    stack.cache.writeItem({ collection: stack.collection('notes'), key: 1, item: { id: 1 } })
    advance(99)
    stack.cache.deleteItem({ collection: todos, key: '1' })
    stack.cache.writeItem({ collection: todos, key: 1, item: { id: 1 } })
    advance(1)

    stack.cache.garbageCollect()
    expect(snapshotKeys(stack, 'todos')).toEqual(['1'])
    expect(snapshotKeys(stack, 'notes')).toEqual([])
    advance(99)
    stack.cache.garbageCollect()
    expect(snapshotKeys(stack, 'todos')).toEqual([])
  })

  it('validates the store option and rejects a bad collection before registering a batch', async () => {
    await expect(createGarbageCollectionStack({
      schema: todoSchema,
      garbageCollection: { maxSize: -1 },
      remote: false,
    })).rejects.toThrow('garbageCollection: maxSize must be an integer >= 0')
    const stack = await createGarbageCollectionStack({ schema: todoSchema, remote: false })
    expect(() => addCollections(stack.store, [
      { name: 'valid' },
      { name: 'invalid', garbageCollection: { ttlMs: 0 } },
    ])).toThrow('invalid.garbageCollection: ttlMs must be > 0')
    expect(stack.store.$collections.map((collection: { name: string }) => collection.name)).toEqual(['todos'])
  })
})
