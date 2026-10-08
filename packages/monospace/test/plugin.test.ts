import { beforeEach, describe, expect, it } from 'vitest'
import { createMockClient, createOrdersCollection, createTodosCollection } from './utils/plugin'
import { createRelationStore, runMonospaceOperation } from './utils/store'

const client = createMockClient()

beforeEach(() => {
  for (const method of Object.values(client)) {
    method.mockReset()
  }
})

describe('monospace public queries and mutations', () => {
  it('handles fetches and mutations through the REST client', async () => {
    const store = await createRelationStore(client)
    const collection = createTodosCollection()
    client.readOne.mockResolvedValueOnce({ id: 1, title: 'Fetched' })
    client.createOne.mockResolvedValueOnce({ id: 2, title: 'Created' })
    client.updateOne.mockResolvedValueOnce({ id: 1, title: 'Updated' })

    const fetched = await runMonospaceOperation(client, 'fetchFirst', { store, collection, key: 1 })
    expect({ id: fetched.id, title: fetched.title }).toEqual({ id: 1, title: 'Fetched' })
    const created = await runMonospaceOperation(client, 'createItem', { store, collection, item: { title: 'Created' } })
    const updated = await runMonospaceOperation(client, 'updateItem', { store, collection, item: { id: 1, title: 'Updated' }, key: 1 })

    expect(client.readOne).toHaveBeenCalledExactlyOnceWith('Todos', 1, { fields: ['*'] })
    expect(created).toEqual({ id: 2, title: 'Created' })
    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(client.updateOne).toHaveBeenCalledExactlyOnceWith('Todos', 1, { title: 'Updated' }, { fields: ['*'] })
    expect((await store.Todos.findFirst(1)).title).toBe('Updated')
    expect((await store.Todos.findFirst(2)).title).toBe('Created')
  })

  it('reads a numeric zero key through its item route', async () => {
    client.readOne.mockResolvedValueOnce({ id: 0, title: 'Zero' })
    const result = await runMonospaceOperation(client, 'fetchFirst', { collection: createTodosCollection(), key: 0 })

    expect(client.readOne).toHaveBeenCalledExactlyOnceWith('Todos', 0, { fields: ['*'] })
    expect({ id: result.id, title: result.title }).toEqual({ id: 0, title: 'Zero' })
    expect(client.readMany).not.toHaveBeenCalled()
  })

  it('reads composite-key items by their key column values', async () => {
    client.readOne.mockResolvedValueOnce({ shop_id: 1, code: 'A' })
    const result = await runMonospaceOperation(client, 'fetchFirst', { collection: createOrdersCollection(), key: '1::A' })

    expect(client.readOne).toHaveBeenCalledExactlyOnceWith('Orders', { shop_id: '1', code: 'A' }, { fields: ['*'] })
    expect(result.shop_id).toBe(1)
    expect(result.code).toBe('A')
  })

  it('reads items of collections without item routes by key filter', async () => {
    const collection = createTodosCollection()
    collection.meta.monospace.itemRoutes = false
    client.readOne.mockResolvedValueOnce({ id: 1 })

    const result = await runMonospaceOperation(client, 'fetchFirst', { collection, key: 1 })

    expect(client.readOne).toHaveBeenCalledExactlyOnceWith('Todos', { id: 1 }, { fields: ['*'] })
    expect(result.id).toBe(1)
  })

  it('deletes both selected items while retaining an unrelated record', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1 }, { id: 2 }, { id: 3 }] } })
    await store.Todos.deleteMany([1, 2])

    expect(client.deleteMany).toHaveBeenCalledExactlyOnceWith('Todos', { filter: { id: { _in: [1, 2] } } })
    expect((await store.Todos.findMany({ fetchPolicy: 'cache-only' })).map((item: any) => item.id)).toEqual([3])
  })

  it('selects every field on list reads without explicit fields', async () => {
    client.readMany.mockResolvedValueOnce([{ id: 1 }])
    const first = await runMonospaceOperation(client, 'fetchFirst', {
      collection: createTodosCollection(),
      findOptions: { filter: { id: { _eq: 1 } } },
    })

    expect(client.readMany).toHaveBeenCalledExactlyOnceWith('Todos', { fields: ['*'], filter: { id: { _eq: 1 } }, limit: 1 })
    expect(first.id).toBe(1)
  })

  it('filters real cached records before returning a list', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1, completed: false }, { id: 2, completed: true }] }, cachedQueries: { Todos: [{ filter: { completed: { _eq: false } } }] } })
    const result = await store.Todos.findMany({ filter: { completed: { _eq: false } } })

    expect(result.map((item: any) => ({ id: item.id, completed: item.completed }))).toEqual([{ id: 1, completed: false }])
    expect(client.readMany).not.toHaveBeenCalled()
  })

  it('fetches first and many results when a cached relation filter is unsupported', async () => {
    const filter = { author: { name: { _eq: 'Jane' } } }
    // Seed the completed query marker so real cache candidates reach both filter hooks.
    const store = await createRelationStore(client, {
      cacheItems: { Todos: [{ id: 1 }] },
      cachedQueries: { Todos: [{ filter }] },
    })
    client.readMany.mockResolvedValue([{ id: 2, author_id: 'p1' }])

    expect((await store.Todos.findFirst({ filter })).id).toBe(2)
    expect((await store.Todos.findMany({ filter })).map((item: any) => item.id)).toEqual([2])
    expect(client.readMany).toHaveBeenNthCalledWith(1, 'Todos', { fields: ['*'], filter, limit: 1 })
    expect(client.readMany).toHaveBeenNthCalledWith(2, 'Todos', { fields: ['*'], filter })
    expect(client.readMany).toHaveBeenCalledTimes(2)
  })

  it('clears an unsupported first-result candidate supplied to the real adapter hook', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1, title: 'Unfiltered' }] } })
    const collection = store.$collections.find((entry: any) => entry.name === 'Todos')
    let result: any = store.$cache.readItem({ collection, key: 1 })
    // Another cache plugin can publish a candidate before Monospace evaluates it.
    // Core's default object-filter path starts empty, so preserve this adapter contract separately.
    store.$hooks.callHookSync('cacheFilterFirst', {
      store,
      collection,
      meta: {},
      key: undefined,
      findOptions: { filter: { author: { name: { _eq: 'Jane' } } } },
      readItemsFromCache: () => store.$cache.readItems({ collection }),
      getResult: () => result,
      setResult: (value: any) => { result = value },
    })

    expect(result).toBeUndefined()
    expect(store.$cache.getState().collections.Todos[1]).toEqual({ id: 1, title: 'Unfiltered' })
    expect(client.readMany).not.toHaveBeenCalled()
  })

  it('returns key-based cache results without evaluating an unsupported filter', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1, title: 'Cached' }] } })
    const result = await store.Todos.findFirst({ key: 1, filter: { author: { name: { _eq: 'Jane' } } } })

    expect(result.title).toBe('Cached')
    expect(client.readOne).not.toHaveBeenCalled()
    expect(client.readMany).not.toHaveBeenCalled()
  })

  it('does not call Monospace or delete cached records for an empty batch', async () => {
    const store = await createRelationStore(client, { cacheItems: { Todos: [{ id: 1 }] } })
    await store.Todos.deleteMany([])

    expect(client.deleteMany).not.toHaveBeenCalled()
    expect(client.deleteOne).not.toHaveBeenCalled()
    expect((await store.Todos.findMany({ fetchPolicy: 'cache-only' })).map((item: any) => item.id)).toEqual([1])
  })
})
