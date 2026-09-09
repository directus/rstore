import { describe, expect, it } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection, todoSchema } from './utils'

describe('item eviction coherence', () => {
  it('emits one numeric-key hook after cleaning row-owned metadata', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: 0 }, { id: 1 }] },
    })
    const collected: any[] = []
    stack.store.$hooks.hook('itemGarbageCollect', (payload: any) => collected.push(payload))
    const scope = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await scope.result
    const collection = stack.collection('todos')
    const item = cached(stack, 'todos', 0)!
    stack.cache.writeFieldTimestamps({ collectionName: 'todos', key: 0, timestamps: { title: 100 } })
    stack.cache.writeFieldTimestamps({ collectionName: 'todos', key: 1, timestamps: { title: 200 } })

    scope.stop()
    stack.cache.garbageCollectItem({ collection, item })

    expect(cached(stack, 'todos', 0)).toBeUndefined()
    expect(stack.cache.readFieldTimestamps({ collectionName: 'todos', key: 0 })).toBeUndefined()
    expect(stack.cache.readFieldTimestamps({ collectionName: 'todos', key: 1 })).toEqual({ title: 200 })
    expect(collected).toHaveLength(1)
    expect(collected[0]).toMatchObject({ store: stack.store, collection, key: 0 })
    expect(collected[0]?.item).toBe(item)
    expect(stack.cache.tombstones.size()).toBe(0)

    stack.cache.garbageCollectItem({ collection, item })
    expect(collected).toHaveLength(1)

    stack.cache.garbageCollectItem({ collection, item: cached(stack, 'todos', 1)! })
    expect(collected.map(payload => payload.key)).toEqual([0, 1])
  })

  it('does not emit a hook or evict a row owned by a live query', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const collected: any[] = []
    stack.store.$hooks.hook('itemGarbageCollect', (payload: any) => collected.push(payload))

    stack.cache.garbageCollectItem({ collection: stack.collection('todos'), item: query.data.value[0] })

    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    expect(collected).toEqual([])
  })

  it('removes an unowned relation target from public relation reads', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: { posts: [{ id: 'p1', authorId: 'a1' }] },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const authors = stack.collection('authors')
    stack.cache.writeItem({ collection: authors, key: 'a1', item: { id: 'a1', name: 'Ada' } })
    expect(query.data.value[0].author.name).toBe('Ada')

    stack.cache.garbageCollect()

    expect(query.data.value.map((post: any) => post.id)).toEqual(['p1'])
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    expect(query.data.value[0].author).toBeUndefined()
  })

  it('sweeps unowned rows across collections while retaining a query-owned row', async () => {
    const stack = await createGarbageCollectionStack({
      schema: [{ name: 'todos' }, { name: 'notes' }],
      data: { todos: [{ id: 'kept' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    stack.cache.writeItem({ collection: stack.collection('todos'), key: 'discarded', item: { id: 'discarded' } })
    stack.cache.writeItem({ collection: stack.collection('notes'), key: 'note', item: { id: 'note' } })

    stack.cache.garbageCollect()

    expect(query.data.value.map((item: any) => item.id)).toEqual(['kept'])
    expect(cached(stack, 'todos', 'kept')).toBeDefined()
    expect(cached(stack, 'todos', 'discarded')).toBeUndefined()
    expect(cached(stack, 'notes', 'note')).toBeUndefined()
  })

  it('gives a reinserted key fresh wrapper metadata and new query ownership', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const first = stack.scope(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    await first.result
    const oldItem = cached(stack, 'todos', '1')!
    first.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '1')).toBeUndefined()

    const remount = stack.scope(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const query = await remount.result
    const freshItem = cached(stack, 'todos', '1')!
    stack.cache.garbageCollect()

    expect(freshItem).not.toBe(oldItem)
    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
  })

  it('keeps rollback state while non-skipped update and delete layers own base keys', async () => {
    const stack = await createGarbageCollectionStack({ schema: todoSchema, remote: false })
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'base' } })
    stack.cache.addLayer({
      id: 'optimistic-update',
      collectionName: 'todos',
      state: { 1: { title: 'optimistic' } },
      deletedItems: new Set(),
    })

    stack.cache.garbageCollect()

    expect(cached(stack, 'todos', '1')?.title).toBe('optimistic')

    stack.cache.removeLayer('optimistic-update')
    expect(cached(stack, 'todos', '1')?.title).toBe('base')
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeUndefined()

    stack.cache.writeItem({ collection, key: '2', item: { id: '2', title: 'base delete' } })
    stack.cache.addLayer({
      id: 'optimistic-delete',
      collectionName: 'todos',
      state: {},
      deletedItems: new Set(['2']),
    })
    stack.cache.garbageCollect()
    stack.cache.removeLayer('optimistic-delete')

    expect(cached(stack, 'todos', '2')?.title).toBe('base delete')
    stack.cache.addLayer({
      id: 'skipped-update',
      collectionName: 'todos',
      state: { 2: { title: 'ignored' } },
      deletedItems: new Set(),
      skip: true,
    })
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
  })
})
