import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockDirectusClient,
  createOrdersCollection,
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

describe('mutations', () => {
  it('creates items, updating the singleton instead when configured', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ id: 2, title: 'Created' })
    client.request.mockResolvedValueOnce({ title: 'Site' })

    const created = await runHook(hooks.createItem, {
      collection: createTodosCollection(),
      item: { title: 'Created' },
    })
    const singleton = await runHook(hooks.createItem, {
      collection: createSettingsCollection(),
      item: { title: 'Site' },
    })

    expect(created).toEqual({ id: 2, title: 'Created' })
    expect(singleton).toEqual({ title: 'Site' })
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'createItem', args: ['Todos', { title: 'Created' }] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'updateSingleton', args: ['Settings', { title: 'Site' }] })
  })

  it('creates many items, using the first item for singletons', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    client.request.mockResolvedValueOnce({ title: 'First' })

    const created = await runHook(hooks.createMany, {
      collection: createTodosCollection(),
      items: [{ title: 'A' }, { title: 'B' }],
    })
    const singleton = await runHook(hooks.createMany, {
      collection: createSettingsCollection(),
      items: [{ title: 'First' }, { title: 'Ignored' }],
    })
    const empty = await runHook(hooks.createMany, {
      collection: createSettingsCollection(),
      items: [],
    })

    expect(created).toEqual([{ id: 1 }, { id: 2 }])
    expect(singleton).toEqual([{ title: 'First' }])
    expect(empty).toEqual([])
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'createItems', args: ['Todos', [{ title: 'A' }, { title: 'B' }]] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'updateSingleton', args: ['Settings', { title: 'First' }] })
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('updates items with stripped primary keys', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ id: 1, title: 'Updated' })
    client.request.mockResolvedValueOnce({ title: 'Site' })

    const updated = await runHook(hooks.updateItem, {
      collection: createTodosCollection(),
      key: 1,
      item: { id: 1, title: 'Updated' },
    })
    const singleton = await runHook(hooks.updateItem, {
      collection: createSettingsCollection(),
      key: 'singleton',
      item: { id: 1, title: 'Site' },
    })

    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(singleton).toEqual({ title: 'Site' })
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'updateItem', args: ['Todos', 1, { title: 'Updated' }] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'updateSingleton', args: ['Settings', { title: 'Site' }] })
  })

  it('batch-updates single-key collections with reinjected keys', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

    const result = await runHook(hooks.updateMany, {
      collection: createTodosCollection(),
      items: [
        { key: 1, item: { id: 1, title: 'A' } },
        { key: 2, item: { id: 2, title: 'B' } },
      ],
    })

    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(client.request).toHaveBeenCalledWith({
      op: 'updateItemsBatch',
      args: ['Todos', [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ]],
    })
  })

  it('updates composite-key collections item by item and singletons once', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ shop_id: 's1', code: 'c1', total: 5 })
    client.request.mockResolvedValueOnce({ title: 'Site' })

    const composite = await runHook(hooks.updateMany, {
      collection: createOrdersCollection(),
      items: [
        { key: 's1:c1', item: { shop_id: 's1', code: 'c1', total: 5 } },
      ],
    })
    const singleton = await runHook(hooks.updateMany, {
      collection: createSettingsCollection(),
      items: [
        { key: 'singleton', item: { id: 1, title: 'Site' } },
      ],
    })

    expect(composite).toEqual([{ shop_id: 's1', code: 'c1', total: 5 }])
    expect(singleton).toEqual([{ title: 'Site' }])
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'updateItem', args: ['Orders', 's1:c1', { total: 5 }] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'updateSingleton', args: ['Settings', { title: 'Site' }] })
  })

  it('deletes items and aborts deleteMany unconditionally', async () => {
    const hooks = setupPlugin(client)
    const abort = vi.fn()
    const singletonAbort = vi.fn()

    await runHook(hooks.deleteItem, {
      collection: createTodosCollection(),
      key: 1,
    })
    await runHook(hooks.deleteItem, {
      collection: createSettingsCollection(),
      key: 'singleton',
    })
    await runHook(hooks.deleteMany, {
      abort,
      collection: createTodosCollection(),
      keys: [1, 2],
    })
    await runHook(hooks.deleteMany, {
      abort: singletonAbort,
      collection: createSettingsCollection(),
      keys: ['singleton'],
    })

    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'deleteItem', args: ['Todos', 1] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'deleteItems', args: ['Todos', [1, 2]] })
    // Singletons are never deleted, but deleteMany still aborts (current behavior).
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(abort).toHaveBeenCalled()
    expect(singletonAbort).toHaveBeenCalled()
  })
})
