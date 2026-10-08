import type { StoreSchema } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
  createTodosCollection,
  runHook,
  setupPlugin,
} from './utils/plugin'
import { createDirectusStack } from './utils/store'

vi.mock('@directus/sdk', async () => (await import('./utils/sdk-mocks')).directusSdkMocks())

/** Real relation consumers used by the focused adapter edge cases. */
const schema: StoreSchema = [createTodosCollection(), createProfilesCollection()]

describe('fetchRelations', () => {
  it('deduplicates FK values and skips null FKs and unkeyed parents', async () => {
    const { store, client } = await createDirectusStack(schema)
    const hooks = setupPlugin(client)
    client.request.mockResolvedValueOnce([{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Grace' }])

    // Raw unkeyed results are an adapter contract; the public fetch path can
    // normalize/discard them before relation dispatch, hiding this case.
    await runHook(hooks.fetchRelations, {
      store,
      collection: createTodosCollection(),
      getResult: () => [
        { id: 1, author_id: 'p1' },
        { id: 2, author_id: 'p1' },
        { id: 3, author_id: null },
        { id: null, author_id: 'p9' },
        { id: 4, author_id: 'p2' },
      ],
      findOptions: { include: { author: true } },
    })

    expect(client.request.mock.calls).toEqual([[{
      op: 'readItems',
      args: ['Profiles', { filter: { id: { _in: expect.arrayContaining(['p1', 'p2']) } } }],
    }]])
    expect(client.request.mock.calls[0]![0].args[1].filter.id._in).toHaveLength(2)
    expect(store.Profiles.peekMany().map((item: any) => ({ id: item.id, name: item.name }))).toEqual([
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Grace' },
    ])
  })

  it('batches composite joins without mixing items from different orders', async () => {
    const { store, client } = await createDirectusStack([
      { ...createOrdersCollection(), relations: { items: { many: true, to: { OrderItems: { on: { order_shop_id: 'shop_id', order_code: 'code' } } } } } },
      createOrderItemsCollection(),
    ])
    client.request.mockResolvedValueOnce([
      { shop_id: 's1', code: 'c1' },
      { shop_id: 's1', code: 'c2' },
      { shop_id: 's1', code: 'c1' },
    ]).mockResolvedValueOnce([
      { id: 1, order_shop_id: 's1', order_code: 'c1', title: 'First order' },
      { id: 2, order_shop_id: 's1', order_code: 'c2', title: 'Second order' },
    ])

    const orders = await store.Orders.findMany({ include: { items: true } })

    expect(orders.map((order: any) => ({ code: order.code, items: order.items.map((item: any) => item.title) }))).toEqual([
      { code: 'c1', items: ['First order'] },
      { code: 'c2', items: ['Second order'] },
      { code: 'c1', items: ['First order'] },
    ])
    expect(client.request).toHaveBeenCalledTimes(2)
    const groups = client.request.mock.calls[1]![0].args[1].filter._or
    // Conjunction/disjunction ordering is incidental; exact group membership
    // and sizes still reject dropped fields, duplicate joins, and extra keys.
    expect(groups).toEqual(expect.arrayContaining([
      { _and: expect.arrayContaining([{ order_shop_id: { _eq: 's1' } }, { order_code: { _eq: 'c1' } }]) },
      { _and: expect.arrayContaining([{ order_shop_id: { _eq: 's1' } }, { order_code: { _eq: 'c2' } }]) },
    ]))
    expect(groups).toHaveLength(2)
    expect(groups.map((group: any) => group._and.length)).toEqual([2, 2])
  })

  it('throws for includes that do not match a relation', async () => {
    const { store, client } = await createDirectusStack(schema)
    const hooks = setupPlugin(client)

    await expect(runHook(hooks.fetchRelations, {
      store,
      collection: createTodosCollection(),
      getResult: () => [{ id: 1 }],
      findOptions: { include: { unknown: true } },
    })).rejects.toThrow('Relation "unknown" does not exist on collection "Todos"')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('resolves empty authors without requesting Profiles when all FKs are null', async () => {
    const { store, client } = await createDirectusStack([
      { ...createTodosCollection(), relations: { author: { to: { Profiles: { on: { id: 'author_id' } } } } } },
      createProfilesCollection(),
    ])
    client.request.mockResolvedValueOnce([{ id: 1, author_id: null }, { id: 2, author_id: null }])

    const todos = await store.Todos.findMany({ include: { author: true } })

    expect(todos.map((todo: any) => ({ id: todo.id, author: todo.author }))).toEqual([
      { id: 1, author: undefined },
      { id: 2, author: undefined },
    ])
    expect(client.request.mock.calls).toEqual([[{ op: 'readItems', args: ['Todos', {}] }]])
    expect(store.Profiles.peekMany()).toEqual([])
  })
})
