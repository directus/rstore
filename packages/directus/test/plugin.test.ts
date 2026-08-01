import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDirectusRstorePlugin } from '../src'
import {
  createMockDirectusClient,
  createSettingsCollection,
  createTodosCollection,
  runHook,
  setupPlugin,
} from './utils/plugin'

vi.mock('@directus/sdk', async () => (await import('./utils/sdk-mocks')).directusSdkMocks())

const client = createMockDirectusClient()

beforeEach(() => {
  client.request.mockReset()
})

describe('fetchFirst', () => {
  it('reads one item by key, including the falsy key 0', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ id: 1, title: 'Fetched' })
    client.request.mockResolvedValueOnce({ id: 0, title: 'Zero' })

    const fetched = await runHook(hooks.fetchFirst, {
      collection: createTodosCollection(),
      key: 1,
    })
    const zero = await runHook(hooks.fetchFirst, {
      collection: createTodosCollection(),
      key: 0,
    })

    expect(fetched).toEqual({ id: 1, title: 'Fetched' })
    expect(zero).toEqual({ id: 0, title: 'Zero' })
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'readItem', args: ['Todos', 1, {}] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'readItem', args: ['Todos', 0, {}] })
  })

  it('reads singletons through readSingleton', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ title: 'Site' })

    const result = await runHook(hooks.fetchFirst, {
      collection: createSettingsCollection(),
      key: 'singleton',
    })

    expect(result).toEqual({ title: 'Site' })
    expect(client.request).toHaveBeenCalledWith({ op: 'readSingleton', args: ['Settings', {}] })
  })

  it('reads the first matching item when no key is provided', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }])

    const result = await runHook(hooks.fetchFirst, {
      collection: createTodosCollection(),
      findOptions: { filter: { completed: { _eq: false } } },
      key: undefined,
    })

    expect(result).toEqual({ id: 1 })
    expect(client.request).toHaveBeenCalledWith({
      op: 'readItems',
      args: ['Todos', { filter: { completed: { _eq: false } }, limit: 1 }],
    })
  })
})

describe('fetchMany', () => {
  it('reads many items through readItems', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

    const result = await runHook(hooks.fetchMany, {
      collection: createTodosCollection(),
    })

    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(client.request).toHaveBeenCalledWith({ op: 'readItems', args: ['Todos', {}] })
  })

  it('wraps singleton results as a one-item or empty list', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ title: 'Site' })
    client.request.mockResolvedValueOnce(null)

    const wrapped = await runHook(hooks.fetchMany, { collection: createSettingsCollection() })
    const empty = await runHook(hooks.fetchMany, { collection: createSettingsCollection() })

    expect(wrapped).toEqual([{ title: 'Site' }])
    expect(empty).toEqual([])
  })
})

describe('cacheFilterFirst', () => {
  it('keeps key-based results untouched, including the falsy key 0', () => {
    const hooks = setupPlugin(client)
    const setResult = vi.fn()

    hooks.cacheFilterFirst({
      collection: createTodosCollection(),
      findOptions: {},
      key: 0,
      readItemsFromCache: () => [],
      getResult: () => ({ id: 0 }),
      setResult,
    })

    expect(setResult).not.toHaveBeenCalled()
  })

  it('filters cached items and falls back on unsupported filters', async () => {
    const hooks = setupPlugin(client)

    const supported = await runHook(hooks.cacheFilterFirst, {
      collection: createTodosCollection(),
      findOptions: { filter: { completed: { _eq: false } } },
      key: undefined,
      readItemsFromCache: () => [{ id: 1, completed: true }, { id: 2, completed: false }],
    })
    const unsupported = await runHook(hooks.cacheFilterFirst, {
      collection: createTodosCollection(),
      findOptions: { filter: { title: { _fancy: 1 } } },
      key: undefined,
      readItemsFromCache: () => [{ id: 1, title: 'Todo' }],
    })

    expect(supported).toEqual({ id: 2, completed: false })
    expect(unsupported).toBeUndefined()
  })
})

describe('cacheFilterMany', () => {
  it('filters cached items and empties unsupported results', async () => {
    const hooks = setupPlugin(client)
    const items = [
      { id: 1, completed: false },
      { id: 2, completed: true },
    ]

    const supported = await runHook(hooks.cacheFilterMany, {
      collection: createTodosCollection(),
      findOptions: { filter: { completed: { _eq: false } } },
      getResult: () => items,
    })
    const unsupported = await runHook(hooks.cacheFilterMany, {
      collection: createTodosCollection(),
      findOptions: { filter: { title: { _fancy: 1 } } },
      getResult: () => items,
    })

    expect(supported).toEqual([{ id: 1, completed: false }])
    expect(unsupported).toEqual([])
  })
})

describe('resolveDirectusClient', () => {
  it('reuses a provided client without touching the SDK factory', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }])

    await runHook(hooks.fetchMany, { collection: createTodosCollection() })

    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('requires a URL when no client is provided', () => {
    expect(() => createDirectusRstorePlugin({})).toThrow(
      'Directus URL is required to create the rstore Directus plugin when no client is provided',
    )
  })
})
