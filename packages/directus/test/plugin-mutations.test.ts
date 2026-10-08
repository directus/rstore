import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
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

  it('updates the requested key without deleting primary keys from caller-owned items', async () => {
    const hooks = setupPlugin(client)
    const item = { id: 99, title: 'Updated', completed: false }
    const settings = { id: 4, title: 'Site' }
    client.request.mockResolvedValueOnce({ id: 1, title: 'Updated' })
    client.request.mockResolvedValueOnce({ title: 'Site' })

    const updated = await runHook(hooks.updateItem, {
      collection: createTodosCollection(),
      key: 1,
      item,
    })
    const singleton = await runHook(hooks.updateItem, {
      collection: createSettingsCollection(),
      key: 'singleton',
      item: settings,
    })

    expect(updated).toEqual({ id: 1, title: 'Updated' })
    expect(singleton).toEqual({ title: 'Site' })
    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'updateItem', args: ['Todos', 1, { title: 'Updated', completed: false }] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'updateSingleton', args: ['Settings', { title: 'Site' }] })
    expect(item).toEqual({ id: 99, title: 'Updated', completed: false })
    expect(settings).toEqual({ id: 4, title: 'Site' })
  })

  it('batch-updates each requested key even when item bodies contain different keys', async () => {
    const hooks = setupPlugin(client)
    const items = [
      { key: 0, item: { id: 99, title: 'A', completed: false } },
      { key: 2, item: { id: 98, title: 'B', completed: true } },
    ]
    client.request.mockResolvedValueOnce([
      { id: 0, title: 'A', completed: false },
      { id: 2, title: 'B', completed: true },
    ])

    const result = await runHook(hooks.updateMany, {
      collection: createTodosCollection(),
      items,
    })

    expect(result).toEqual([
      { id: 0, title: 'A', completed: false },
      { id: 2, title: 'B', completed: true },
    ])
    expect(client.request.mock.calls).toEqual([[{
      op: 'updateItemsBatch',
      args: ['Todos', [
        { id: 0, title: 'A', completed: false },
        { id: 2, title: 'B', completed: true },
      ]],
    }]])
    expect(items).toEqual([
      { key: 0, item: { id: 99, title: 'A', completed: false } },
      { key: 2, item: { id: 98, title: 'B', completed: true } },
    ])
  })

  it('preserves sparse batch replies instead of synthesizing omitted server fields', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

    const result = await runHook(hooks.updateMany, {
      collection: createTodosCollection(),
      items: [{ key: 1, item: { id: 1, title: 'A' } }, { key: 2, item: { id: 2, title: 'B' } }],
    })

    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(client.request.mock.calls).toEqual([[{
      op: 'updateItemsBatch',
      args: ['Todos', [{ id: 1, title: 'A' }, { id: 2, title: 'B' }]],
    }]])
  })

  it('waits for every composite-key update and preserves input order when replies arrive out of order', async () => {
    const hooks = setupPlugin(client)
    const first = createDeferred<{ shop_id: string, code: string, total: number }>()
    const second = createDeferred<{ shop_id: string, code: string, total: number }>()
    const secondPublished = createDeferred<void>()
    client.request.mockReturnValueOnce(first.promise)
    client.request.mockReturnValueOnce(second.promise)

    let result: unknown
    const composite = runHook(hooks.updateMany, {
      collection: createOrdersCollection(),
      items: [
        { key: 's1:c1', item: { shop_id: 's1', code: 'c1', total: 5 } },
        { key: 's2:c2', item: { shop_id: 's2', code: 'c2', total: 8 } },
      ],
      // Observe publication separately: returning a Promise would make an async
      // helper adopt it, hiding a missing await inside the production hook.
      setResult: (value: unknown) => {
        result = value
      },
    })
    let settled = false
    void composite.then(() => {
      settled = true
    }, () => {
      settled = true
    })
    second.promise.then(() => secondPublished.resolve())
    try {
      second.resolve({ shop_id: 's2', code: 'c2', total: 8 })
      // Observe a completed external reply while the first update remains pending.
      await secondPublished.promise
      expect(settled).toBe(false)
      expect(result).toBeUndefined()
      expect(client.request.mock.calls).toEqual([
        [{ op: 'updateItem', args: ['Orders', 's1:c1', { total: 5 }] }],
        [{ op: 'updateItem', args: ['Orders', 's2:c2', { total: 8 }] }],
      ])
      first.resolve({ shop_id: 's1', code: 'c1', total: 5 })
      await vi.waitFor(() => expect(settled, 'all composite replies complete the update').toBe(true))
      await composite
      expect(result).toEqual([
        { shop_id: 's1', code: 'c1', total: 5 },
        { shop_id: 's2', code: 'c2', total: 8 },
      ])
    }
    finally {
      // Release both external replies even if an intermediate assertion fails.
      first.resolve({ shop_id: 's1', code: 'c1', total: 5 })
      second.resolve({ shop_id: 's2', code: 'c2', total: 8 })
    }
  })

  it('updates singletons once with stripped primary keys', async () => {
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce({ title: 'Site' })
    const singleton = await runHook(hooks.updateMany, {
      collection: createSettingsCollection(),
      items: [
        { key: 'singleton', item: { id: 1, title: 'Site' } },
      ],
    })

    expect(singleton).toEqual([{ title: 'Site' }])
    expect(client.request.mock.calls).toEqual([[{ op: 'updateSingleton', args: ['Settings', { title: 'Site' }] }]])
  })

  it('deletes items and aborts deleteMany unconditionally', async () => {
    const hooks = setupPlugin(client)
    let aborted = false
    let singletonAborted = false

    await runHook(hooks.deleteItem, {
      collection: createTodosCollection(),
      key: 1,
    })
    await runHook(hooks.deleteItem, {
      collection: createSettingsCollection(),
      key: 'singleton',
    })
    await runHook(hooks.deleteMany, {
      abort: () => { aborted = true },
      collection: createTodosCollection(),
      keys: [1, 2],
    })
    await runHook(hooks.deleteMany, {
      abort: () => { singletonAborted = true },
      collection: createSettingsCollection(),
      keys: ['singleton'],
    })

    expect(client.request).toHaveBeenNthCalledWith(1, { op: 'deleteItem', args: ['Todos', 1] })
    expect(client.request).toHaveBeenNthCalledWith(2, { op: 'deleteItems', args: ['Todos', [1, 2]] })
    // Singletons are never deleted, but deleteMany still aborts (current behavior).
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(aborted).toBe(true)
    expect(singletonAborted).toBe(true)
  })
})
