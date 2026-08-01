import { describe, expect, it } from 'vitest'
import {
  createMockDirectusClient,
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
  createRelationStore,
  createTodosCollection,
  runHook,
  setupPlugin,
} from './utils/plugin'

const client = createMockDirectusClient()

describe('fetchRelations', () => {
  it('fetches a single-field relation for all parents in one batched request', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore()

    await runHook(hooks.fetchRelations, {
      store,
      collection: createProfilesCollection(),
      getResult: () => [{ id: 1 }, { id: 2 }],
      findOptions: { include: { todos: true } },
    })

    const todosApi = store.$collection('Todos')
    expect(todosApi.findMany).toHaveBeenCalledTimes(1)
    expect(todosApi.findMany).toHaveBeenCalledWith({
      filter: {
        author_id: {
          _in: [1, 2],
        },
      },
    })
  })

  it('deduplicates FK values and skips null FKs and unkeyed parents', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore()

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

    const profilesApi = store.$collection('Profiles')
    expect(profilesApi.findMany).toHaveBeenCalledTimes(1)
    expect(profilesApi.findMany).toHaveBeenCalledWith({
      filter: {
        id: {
          _in: ['p1', 'p2'],
        },
      },
    })
  })

  it('batches composite joins into deduplicated _or/_and groups', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore({
      collections: [createOrdersCollection(), createOrderItemsCollection()],
    })

    await runHook(hooks.fetchRelations, {
      store,
      collection: createOrdersCollection(),
      getResult: () => [
        { shop_id: 's1', code: 'c1' },
        { shop_id: 's1', code: 'c2' },
        { shop_id: 's1', code: 'c1' },
      ],
      findOptions: { include: { items: true } },
    })

    const itemsApi = store.$collection('OrderItems')
    expect(itemsApi.findMany).toHaveBeenCalledTimes(1)
    expect(itemsApi.findMany).toHaveBeenCalledWith({
      filter: {
        _or: [
          { _and: [{ order_shop_id: { _eq: 's1' } }, { order_code: { _eq: 'c1' } }] },
          { _and: [{ order_shop_id: { _eq: 's1' } }, { order_code: { _eq: 'c2' } }] },
        ],
      },
    })
  })

  it('passes nested includes through to the batched relation fetch', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore()

    // A single (non-array) hook result is normalized to a list.
    await runHook(hooks.fetchRelations, {
      store,
      collection: createTodosCollection(),
      getResult: () => ({ id: 1, author_id: 'p1' }),
      findOptions: {
        include: {
          author: {
            include: { todos: true },
          },
        },
      },
    })

    expect(store.$collection('Profiles').findMany).toHaveBeenCalledWith({
      filter: {
        id: {
          _in: ['p1'],
        },
      },
      include: { todos: true },
    })
  })

  it('throws for includes that do not match a relation', async () => {
    const hooks = setupPlugin(client)

    await expect(runHook(hooks.fetchRelations, {
      store: createRelationStore(),
      collection: createTodosCollection(),
      getResult: () => [{ id: 1 }],
      findOptions: { include: { unknown: true } },
    })).rejects.toThrow('Relation "unknown" does not exist on collection "Todos"')
  })

  it('skips the relation fetch entirely when all FKs are null', async () => {
    const hooks = setupPlugin(client)
    const store = createRelationStore()

    await runHook(hooks.fetchRelations, {
      store,
      collection: createTodosCollection(),
      getResult: () => [{ id: 1, author_id: null }, { id: 2, author_id: null }],
      findOptions: { include: { author: true } },
    })

    expect(store.$collection('Profiles').findMany).not.toHaveBeenCalled()
  })
})
