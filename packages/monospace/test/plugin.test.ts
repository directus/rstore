import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockClient, createOrdersCollection, createRelationStore, createTodosCollection, runHook, setupPlugin } from './utils/plugin'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin', () => {
  it('handles fetches and mutations through the REST client', async () => {
    const hooks = setupPlugin(client)
    const collection = createTodosCollection()
    client.readOne.mockResolvedValueOnce({ id: 1, title: 'Fetched' })
    client.createOne.mockResolvedValueOnce({ id: 2, title: 'Created' })
    client.updateOne.mockResolvedValueOnce({ id: 1, title: 'Updated' })

    const fetched = await runHook(hooks.fetchFirst, {
      collection,
      key: 1,
    })
    const created = await runHook(hooks.createItem, {
      collection,
      item: { title: 'Created' },
    })
    const updated = await runHook(hooks.updateItem, {
      collection,
      item: { id: 1, title: 'Updated' },
      key: 1,
    })

    expect(client.readOne).toHaveBeenCalledWith('Todos', 1, { fields: ['*'] })
    expect(fetched).toEqual({ id: 1, title: 'Fetched' })
    expect(created).toEqual({ id: 2, title: 'Created' })
    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { title: 'Updated' }, { fields: ['*'] })
  })

  it('reads composite-key items by their key column values', async () => {
    const hooks = setupPlugin(client)
    client.readOne.mockResolvedValueOnce({ shop_id: 1, code: 'A' })

    // Composite keys have no `/{key}` route: the client sends a key filter.
    await runHook(hooks.fetchFirst, {
      collection: createOrdersCollection(),
      store: createRelationStore({ collections: [createOrdersCollection()] }),
      key: '1::A',
    })

    expect(client.readOne).toHaveBeenCalledWith('Orders', { shop_id: '1', code: 'A' }, { fields: ['*'] })
  })

  it('reads items of collections without item routes by key filter', async () => {
    const hooks = setupPlugin(client)
    const collection = createTodosCollection()
    collection.meta.monospace.itemRoutes = false
    client.readOne.mockResolvedValueOnce({ id: 1 })

    await runHook(hooks.fetchFirst, { collection, key: 1 })

    expect(client.readOne).toHaveBeenCalledWith('Todos', { id: 1 }, { fields: ['*'] })
  })

  it('deletes many items with a primary-key filter', async () => {
    const hooks = setupPlugin(client)
    const collection = createTodosCollection()
    await hooks.deleteMany({
      abort: vi.fn(),
      collection,
      keys: [1, 2],
    } as any)

    expect(client.deleteMany).toHaveBeenCalledWith('Todos', {
      filter: {
        id: {
          _in: [1, 2],
        },
      },
    })
  })

  it('selects every field on list reads without explicit fields', async () => {
    const hooks = setupPlugin(client)
    client.readMany.mockResolvedValueOnce([{ id: 1 }])

    const first = await runHook(hooks.fetchFirst, {
      collection: createTodosCollection(),
      findOptions: { filter: { id: { _eq: 1 } } },
    })

    expect(client.readMany).toHaveBeenCalledWith('Todos', {
      fields: ['*'],
      filter: { id: { _eq: 1 } },
      limit: 1,
    })
    expect(first).toEqual({ id: 1 })
  })

  it('filters cached items with cacheFilterMany', () => {
    const hooks = setupPlugin(client)
    const items = [
      { id: 1, completed: false },
      { id: 2, completed: true },
    ]
    let result: unknown = items

    hooks.cacheFilterMany({
      collection: createTodosCollection(),
      findOptions: {
        filter: { completed: { _eq: false } },
      },
      getResult: () => result,
      setResult: (value: unknown) => {
        result = value
      },
    })

    expect(result).toEqual([{ id: 1, completed: false }])
  })

  it('falls back to fetching when the cached filter is unsupported', () => {
    const hooks = setupPlugin(client)
    let firstResult: unknown = { id: 1 }
    let manyResult: unknown = [{ id: 1 }]

    hooks.cacheFilterFirst({
      collection: createTodosCollection(),
      findOptions: {
        filter: { author: { name: { _eq: 'Jane' } } },
      },
      key: undefined,
      readItemsFromCache: () => [{ id: 1 }],
      getResult: () => firstResult,
      setResult: (value: unknown) => {
        firstResult = value
      },
    })
    hooks.cacheFilterMany({
      collection: createTodosCollection(),
      findOptions: {
        filter: { author: { name: { _eq: 'Jane' } } },
      },
      getResult: () => manyResult,
      setResult: (value: unknown) => {
        manyResult = value
      },
    })

    expect(firstResult).toBeUndefined()
    expect(manyResult).toEqual([])
  })

  it('keeps key-based cacheFilterFirst results untouched', () => {
    const hooks = setupPlugin(client)
    const setResult = vi.fn()

    hooks.cacheFilterFirst({
      collection: createTodosCollection(),
      findOptions: {},
      key: 1,
      readItemsFromCache: () => [],
      getResult: () => ({ id: 1 }),
      setResult,
    })

    expect(setResult).not.toHaveBeenCalled()
  })

  it('does not call Monospace when deleteMany receives no keys', async () => {
    const hooks = setupPlugin(client)
    const abort = vi.fn()
    await hooks.deleteMany({
      abort,
      collection: createTodosCollection(),
      keys: [],
    } as any)

    expect(client.deleteMany).not.toHaveBeenCalled()
    expect(client.deleteOne).not.toHaveBeenCalled()
    expect(abort).toHaveBeenCalled()
  })
})
