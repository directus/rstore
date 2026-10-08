import { describe, expect, it } from 'vitest'
import { createFormOp, createMockClient, createOrdersCollection, createProfilesCollection, createTodosCollection } from './utils/plugin'
import { createRelationStore, runMonospaceOperation } from './utils/store'

describe('monospace parent join identity during optimistic relation writes', () => {
  it('retains cached scalar key types instead of substituting the mutation key', async () => {
    const client = createMockClient()
    const store = await createRelationStore(client, { cacheItems: {
      Profiles: [{ id: 0 }],
      Todos: [{ id: 1, author_id: 0 }, { id: 2, author_id: 0 }, { id: 9, author_id: '0' }],
    } })
    client.updateOne.mockResolvedValueOnce({ id: 0 })

    await runMonospaceOperation(client, 'updateItem', {
      collection: createProfilesCollection(),
      store,
      key: '0',
      item: {},
      formOperations: [createFormOp('todos', 'set', [{ id: 2 }, { id: 3 }])],
    })

    expect(client.updateOne).toHaveBeenCalledExactlyOnceWith('Profiles', '0', {
      todos: [{ _disconnect: { filter: { id: 1 } } }, { _connect: { keys: [{ id: 3 }] } }],
    }, { fields: ['*'] })
    expect(store.$cache.getState().collections.Todos).toEqual({
      1: { id: 1, author_id: null },
      2: { id: 2, author_id: 0 },
      3: { id: 3, author_id: 0 },
      9: { id: 9, author_id: '0' },
    })
  })

  it('clears every child of a cached composite parent while retaining both near-matches', async () => {
    const client = createMockClient()
    const store = await createRelationStore(client, { cacheItems: {
      Orders: [{ shop_id: 1, code: 'A' }],
      OrderItems: [
        { id: 1, order_shop_id: 1, order_code: 'A' },
        { id: 2, order_shop_id: 1, order_code: 'A' },
        { id: 8, order_shop_id: 1, order_code: 'B' },
        { id: 9, order_shop_id: 2, order_code: 'A' },
      ],
    } })
    client.updateOne.mockResolvedValueOnce({ shop_id: 1, code: 'A' })

    await runMonospaceOperation(client, 'updateItem', {
      collection: createOrdersCollection(),
      store,
      key: '1::A',
      item: {},
      formOperations: [createFormOp('items', 'disconnect', [])],
    })

    expect(client.updateOne).toHaveBeenCalledExactlyOnceWith('Orders', { shop_id: 1, code: 'A' }, {
      items: [{ _disconnect: {} }],
    }, { fields: ['*'] })
    expect(store.$cache.getState().collections.OrderItems).toEqual({
      1: { id: 1, order_shop_id: null, order_code: null },
      2: { id: 2, order_shop_id: null, order_code: null },
      8: { id: 8, order_shop_id: 1, order_code: 'B' },
      9: { id: 9, order_shop_id: 2, order_code: 'A' },
    })
  })

  it('uses known non-primary joins without guessing missing values from the mutation identity', async () => {
    const client = createMockClient()
    const profiles = createProfilesCollection()
    profiles.normalizedRelations.todos.to[0].on = { author_id: 'email' }
    const todos = createTodosCollection()
    todos.normalizedRelations.author.to[0].on = { email: 'author_id' }
    const store = await createRelationStore(client, {
      collections: [profiles, todos],
      cacheItems: {
        Profiles: [{ id: 'p1' }, { id: 'p2', email: 'p1' }],
        Todos: [{ id: 1, author_id: 'p1' }, { id: 2, author_id: null }],
      },
    })
    client.updateOne.mockResolvedValueOnce({ id: 'p1', email: 'owner@example.test' })

    await runMonospaceOperation(client, 'updateItem', {
      collection: profiles,
      store,
      key: 'p1',
      item: {},
      formOperations: [createFormOp('todos', 'set', [{ id: 2 }])],
    })

    expect(client.updateOne).toHaveBeenCalledExactlyOnceWith('Profiles', 'p1', {
      todos: [{ _connect: { keys: [{ id: 2 }] } }],
    }, { fields: ['*'] })
    expect(store.$cache.getState().collections.Todos).toEqual({
      1: { id: 1, author_id: 'p1' },
      2: { id: 2, author_id: 'owner@example.test' },
    })
    expect((await store.Todos.findFirst(1)).author.id).toBe('p2')

    const todoCollection = store.$collections.find((entry: any) => entry.name === 'Todos')
    store.$cache.writeItem({ collection: todoCollection, key: 3, item: { id: 3, author_id: 'owner@example.test' } })
    client.updateOne.mockResolvedValueOnce({ id: 'p1', email: 'owner@example.test' })

    await runMonospaceOperation(client, 'updateItem', {
      collection: profiles,
      store,
      key: 'p1',
      item: {},
      formOperations: [createFormOp('todos', 'disconnect', [])],
    })

    expect(client.updateOne).toHaveBeenNthCalledWith(2, 'Profiles', 'p1', {
      todos: [{ _disconnect: {} }],
    }, { fields: ['*'] })
    expect(store.$cache.getState().collections.Todos).toEqual({
      1: { id: 1, author_id: 'p1' },
      2: { id: 2, author_id: null },
      3: { id: 3, author_id: null },
    })
  })
})
