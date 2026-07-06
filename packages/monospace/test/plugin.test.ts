import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockClient, createTodosCollection, runHook, setupPlugin } from './utils/plugin'

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

    expect(fetched).toEqual({ id: 1, title: 'Fetched' })
    expect(created).toEqual({ id: 2, title: 'Created' })
    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { title: 'Updated' }, {})
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
