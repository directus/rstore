import { describe, expect, it, vi } from 'vitest'
import { createOrdersCollection, createTodosCollection } from '../utils/plugin'
import { createDirectusStack } from '../utils/store'

vi.mock('@directus/sdk', async () => (await import('../utils/sdk-mocks')).directusSdkMocks())

describe('directus mutation consumers', () => {
  it('updates every explicit composite target despite serialized identity matching an untouched rival', async () => {
    const { store, client } = await createDirectusStack([{
      ...createOrdersCollection(),
      fields: {
        shop_id: { serialize: () => 'rival' },
        code: { serialize: () => 'rival' },
      },
    }])
    const rows = new Map([
      ['s1:c1', { shop_id: 's1', code: 'c1', total: 1 }],
      ['s2:c2', { shop_id: 's2', code: 'c2', total: 2 }],
      ['rival:rival', { shop_id: 'rival', code: 'rival', total: 99 }],
    ])
    for (const row of rows.values()) {
      store.Orders.writeItem(structuredClone(row))
    }
    // SDK simulation applies writes to the supplied target, so a wrong target
    // changes the rival and cannot manufacture a successful requested result.
    client.request.mockImplementation(async ({ op, args }) => {
      if (op === 'readItems' && args[0] === 'Orders') {
        return structuredClone([...rows.values()])
      }
      if (op === 'updateItem' && args[0] === 'Orders') {
        const row = rows.get(args[1])
        if (!row) {
          throw new Error(`Unknown order target: ${args[1]}`)
        }
        Object.assign(row, structuredClone(args[2]))
        return structuredClone(row)
      }
      throw new Error(`Unexpected Directus command: ${op}`)
    })
    const edits = [
      { shop_id: 's1', code: 'c1', total: 5 },
      { shop_id: 's2', code: 'c2', total: 8 },
    ]

    const result = await store.Orders.updateMany(edits)

    expect.soft(client.request.mock.calls).toEqual([
      [{ op: 'updateItem', args: ['Orders', 's1:c1', { total: 5 }] }],
      [{ op: 'updateItem', args: ['Orders', 's2:c2', { total: 8 }] }],
    ])
    expect(result).toEqual([
      { shop_id: 's1', code: 'c1', total: 5 },
      { shop_id: 's2', code: 'c2', total: 8 },
    ])
    expect(store.Orders.peekMany().map((item: any) => ({ shop_id: item.shop_id, code: item.code, total: item.total }))).toEqual([
      { shop_id: 's1', code: 'c1', total: 5 },
      { shop_id: 's2', code: 'c2', total: 8 },
      { shop_id: 'rival', code: 'rival', total: 99 },
    ])
    expect(await store.Orders.findMany({ fetchPolicy: 'fetch-only' })).toEqual([
      { shop_id: 's1', code: 'c1', total: 5 },
      { shop_id: 's2', code: 'c2', total: 8 },
      { shop_id: 'rival', code: 'rival', total: 99 },
    ])
    expect(edits).toEqual([
      { shop_id: 's1', code: 'c1', total: 5 },
      { shop_id: 's2', code: 'c2', total: 8 },
    ])
    expect(store.$mutationHistory[0].payload).toEqual([
      { key: 's1:c1', item: { shop_id: 'rival', code: 'rival', total: 5 } },
      { key: 's2:c2', item: { shop_id: 'rival', code: 'rival', total: 8 } },
    ])
  })

  it('rolls back rejected edits and permits a later update without changing another row', async () => {
    const { store, client } = await createDirectusStack([createTodosCollection()])
    store.Todos.writeItem({ id: 1, title: 'Original', completed: false })
    store.Todos.writeItem({ id: 2, title: 'Untouched', completed: true })
    const outage = new Error('Directus update unavailable')
    client.request.mockRejectedValueOnce(outage)

    await expect(store.Todos.update({ id: 1, title: 'Rejected', completed: true })).rejects.toBe(outage)

    expect(store.Todos.peekMany().map((item: any) => ({ id: item.id, title: item.title, completed: item.completed }))).toEqual([
      { id: 1, title: 'Original', completed: false },
      { id: 2, title: 'Untouched', completed: true },
    ])
    expect(store.$mutationHistory).toEqual([])
    client.request.mockResolvedValueOnce({ id: 1, title: 'Recovered', completed: true })

    expect(await store.Todos.update({ id: 1, title: 'Recovered', completed: true }))
      .toEqual({ id: 1, title: 'Recovered', completed: true })
    expect(client.request.mock.calls).toEqual([
      [{ op: 'updateItem', args: ['Todos', 1, { title: 'Rejected', completed: true }] }],
      [{ op: 'updateItem', args: ['Todos', 1, { title: 'Recovered', completed: true }] }],
    ])
    expect(store.Todos.peekMany().map((item: any) => ({ id: item.id, title: item.title, completed: item.completed }))).toEqual([
      { id: 1, title: 'Recovered', completed: true },
      { id: 2, title: 'Untouched', completed: true },
    ])
    expect(store.$mutationHistory).toHaveLength(1)
  })

  it('updates original batch identities and retains serialized patches for later hooks and history', async () => {
    const { store, client } = await createDirectusStack([{
      ...createTodosCollection(),
      fields: { id: { serialize: (id: number) => id + 100 } },
    }])
    store.Todos.writeItem({ id: 0, title: 'Zero', completed: true })
    store.Todos.writeItem({ id: 2, title: 'Second', completed: false })
    store.Todos.writeItem({ id: 99, title: 'Untouched', completed: true })
    let publishedItems: unknown
    store.$hooks.hook('afterManyMutation', ({ items }: any) => {
      // Capture before history publication so destructive adapter edits cannot
      // rewrite the evidence through a shared object reference.
      publishedItems = structuredClone(items)
    })
    client.request.mockResolvedValueOnce([
      { id: 0, title: 'Edited zero', completed: false },
      { id: 2, title: 'Edited second', completed: true },
    ])
    const edits = [
      { id: 0, title: 'Edited zero', completed: false },
      { id: 2, title: 'Edited second', completed: true },
    ]

    const result = await store.Todos.updateMany(edits)

    expect(client.request.mock.calls).toEqual([[{
      op: 'updateItemsBatch',
      args: ['Todos', [
        { id: 0, title: 'Edited zero', completed: false },
        { id: 2, title: 'Edited second', completed: true },
      ]],
    }]])
    expect(result).toEqual([
      { id: 0, title: 'Edited zero', completed: false },
      { id: 2, title: 'Edited second', completed: true },
    ])
    expect(store.Todos.peekMany().map((item: any) => ({ id: item.id, title: item.title, completed: item.completed }))).toEqual([
      { id: 0, title: 'Edited zero', completed: false },
      { id: 2, title: 'Edited second', completed: true },
      { id: 99, title: 'Untouched', completed: true },
    ])
    expect(edits).toEqual([
      { id: 0, title: 'Edited zero', completed: false },
      { id: 2, title: 'Edited second', completed: true },
    ])
    expect(publishedItems).toEqual([
      { key: 0, item: { id: 100, title: 'Edited zero', completed: false } },
      { key: 2, item: { id: 102, title: 'Edited second', completed: true } },
    ])
    expect(store.$mutationHistory).toHaveLength(1)
    expect(store.$mutationHistory[0].payload).toEqual([
      { key: 0, item: { id: 100, title: 'Edited zero', completed: false } },
      { key: 2, item: { id: 102, title: 'Edited second', completed: true } },
    ])
  })
})
