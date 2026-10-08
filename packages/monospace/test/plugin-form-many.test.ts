import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
} from './utils/plugin'
import { createRelationStore, runMonospaceOperation } from './utils/store'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('monospace to-many form operation workflows', () => {
  describe('to-many relations', () => {
    it('translates connect ops and patches the target FK column in the cache', async () => {
      const store = await createRelationStore(client)

      client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'connect', { id: 3, title: 'C' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _connect: { keys: [{ id: 3 }] } }],
      }, { fields: ['*'] })
      // The connected todo's real FK column is patched in the cache so the
      // relation accessor resolves without a refetch.
      expect(store.$cache.getState().collections.Todos[3]).toEqual({ id: 3, author_id: 'p1' })
    })

    it('translates a targeted disconnect into a keyed _disconnect filter', async () => {
      const store = await createRelationStore(client)

      client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'disconnect', undefined, { id: 2, title: 'B' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: { filter: { id: 2 } } }],
      }, { fields: ['*'] })
      expect(store.$cache.getState().collections.Todos[2]).toEqual({ id: 2, author_id: null })
    })

    it('combines multiple targeted disconnects into one _or filter', async () => {
      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createProfilesCollection(),
        key: 'p1',
        item: {},
        formOperations: [
          createFormOp('todos', 'disconnect', undefined, { id: 1 }),
          createFormOp('todos', 'disconnect', undefined, { id: 2 }),
        ],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: { filter: { _or: expect.arrayContaining([{ id: 1 }, { id: 2 }]) } } }],
      }, { fields: ['*'] })
      expect(client.updateOne.mock.lastCall![2].todos[0]._disconnect.filter._or).toHaveLength(2)
    })

    it('translates disconnect-all into an empty _disconnect and clears cached FK columns', async () => {
      const store = await createRelationStore(client, {
        cacheItems: {
          Todos: [
            { id: 1, author_id: 'p1' },
            { id: 2, author_id: 'p1' },
            { id: 9, author_id: 'p2' },
          ],
        },
      })

      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'disconnect', [], [{ id: 1 }, { id: 2 }])],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: {} }],
      }, { fields: ['*'] })
      expect(store.$cache.getState().collections.Todos[1]).toEqual({ id: 1, author_id: null })
      expect(store.$cache.getState().collections.Todos[2]).toEqual({ id: 2, author_id: null })
      expect(store.$cache.getState().collections.Todos[9]).toEqual({ id: 9, author_id: 'p2' })
    })

    it('decomposes $set into connects and disconnects against the cache state', async () => {
      const store = await createRelationStore(client, {
        cacheItems: {
          Todos: [
            { id: 1, author_id: 'p1' },
            { id: 2, author_id: 'p1' },
            { id: 9, author_id: 'p2' },
          ],
        },
      })

      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'set', [{ id: 2 }, { id: 3 }], [{ id: 1 }, { id: 2 }])],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [
          { _disconnect: { filter: { id: 1 } } },
          { _connect: { keys: [{ id: 3 }] } },
        ],
      }, { fields: ['*'] })
      expect(store.$cache.getState().collections.Todos[1]).toEqual({ id: 1, author_id: null })
      expect(store.$cache.getState().collections.Todos[3]).toEqual({ id: 3, author_id: 'p1' })
      // The kept item is left untouched.
      expect(store.$cache.getState().collections.Todos[2]).toEqual({ id: 2, author_id: 'p1' })
      expect(store.$cache.getState().collections.Todos[9]).toEqual({ id: 9, author_id: 'p2' })
    })

    it('connects all $set items with an operation array on create', async () => {
      client.createOne.mockResolvedValueOnce({ id: 'p2', name: 'John' })

      await runMonospaceOperation(client, 'createItem', {
        collection: createProfilesCollection(),
        item: { name: 'John' },
        formOperations: [createFormOp('todos', 'set', [{ id: 1 }, { id: 2 }], [])],
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', {
        name: 'John',
        todos: [{ _connect: { keys: [{ id: 1 }, { id: 2 }] } }],
      }, { fields: ['*'] })
    })

    it('keeps rejected relation writes absent and recovers both targets on a later valid write', async () => {
      const store = await createRelationStore(client, {
        cacheItems: { Todos: [
          { id: 1, title: 'A', author_id: null },
          { id: 2, title: 'B', author_id: 'p2' },
          { id: 3, title: 'Untouched', author_id: 'p3' },
        ] },
      })
      client.updateOne.mockRejectedValueOnce(new Error('permission denied'))
      const input = {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [
          createFormOp('todos', 'connect', { id: 1 }),
          createFormOp('todos', 'connect', { id: 2 }),
        ],
      }

      await expect(runMonospaceOperation(client, 'updateItem', input)).rejects.toThrow('permission denied')

      expect(store.$cache.getState().collections.Todos).toEqual({
        1: { id: 1, title: 'A', author_id: null },
        2: { id: 2, title: 'B', author_id: 'p2' },
        3: { id: 3, title: 'Untouched', author_id: 'p3' },
      })
      expect(store.$cache.getState().collections.Profiles ?? {}).toEqual({})
      client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

      await runMonospaceOperation(client, 'updateItem', input)

      expect(client.updateOne).toHaveBeenNthCalledWith(2, 'Profiles', 'p1', {
        todos: [{ _connect: { keys: [{ id: 1 }, { id: 2 }] } }],
      }, { fields: ['*'] })
      expect(store.$cache.getState().collections.Todos).toEqual({
        1: { id: 1, title: 'A', author_id: 'p1' },
        2: { id: 2, title: 'B', author_id: 'p1' },
        3: { id: 3, title: 'Untouched', author_id: 'p3' },
      })
      expect((await store.Profiles.findFirst('p1')).todos.map((item: any) => item.id)).toEqual([1, 2])
      expect(client.updateOne).toHaveBeenCalledTimes(2)
    })

    it('uses composite parent keys for FK column patches', async () => {
      const store = await createRelationStore(client, {
        collections: [createOrdersCollection(), createOrderItemsCollection()],
      })

      client.updateOne.mockResolvedValueOnce({ shop_id: 1, code: 'A' })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createOrdersCollection(),
        store,
        key: '1::A',
        item: {},
        formOperations: [createFormOp('items', 'connect', { id: 5 })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Orders', { shop_id: '1', code: 'A' }, {
        items: [{ _connect: { keys: [{ id: 5 }] } }],
      }, { fields: ['*'] })
      expect(store.$cache.getState().collections.OrderItems[5]).toEqual({ id: 5, order_shop_id: 1, order_code: 'A' })
    })
  })
})
