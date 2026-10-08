import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
  createTodosCollection,
} from './utils/plugin'
import { createRelationStore, runMonospaceOperation } from './utils/store'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin form relation operations', () => {
  describe('to-one relations', () => {
    it('translates connect on create into a single _connect object', async () => {
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })

      // The form projection already wrote `author_id` on the body, but
      // Monospace create inputs reject FK columns: the relation field
      // carries the `_connect` operation instead.
      const result: any = await runMonospaceOperation(client, 'createItem', {
        collection: createTodosCollection(),
        item: { title: 'A', author_id: 'p1' },
        formOperations: [createFormOp('author', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', {
        title: 'A',
        author: { _connect: { key: { id: 'p1' } } },
      }, { fields: ['*'] })
      expect(result).toEqual({ id: 5, title: 'A', author_id: 'p1' })
    })

    it('writes the FK column for connect on update', async () => {
      client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: 'p1' })

      const result: any = await runMonospaceOperation(client, 'updateItem', {
        collection: createTodosCollection(),
        key: 1,
        item: { id: 1, author_id: 'p1' },
        formOperations: [createFormOp('author', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
        author_id: 'p1',
      }, { fields: ['*'] })
      expect(result).toEqual({ id: 1, title: 'A', author_id: 'p1' })
    })

    it('nulls the FK column for disconnect on update', async () => {
      client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: null })

      const result: any = await runMonospaceOperation(client, 'updateItem', {
        collection: createTodosCollection(),
        key: 1,
        item: { id: 1, author_id: null },
        formOperations: [createFormOp('author', 'disconnect', undefined, undefined)],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
        author_id: null,
      }, { fields: ['*'] })
      expect(result).toEqual({ id: 1, title: 'A', author_id: null })
    })

    it('omits the relation for disconnect on create', async () => {
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: null })

      await runMonospaceOperation(client, 'createItem', {
        collection: createTodosCollection(),
        item: { title: 'A', author_id: null },
        formOperations: [createFormOp('author', 'disconnect', undefined, undefined)],
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', { title: 'A' }, { fields: ['*'] })
    })

    it('writes composite FK columns for connect', async () => {
      const store = await createRelationStore(client, {
        collections: [createOrdersCollection(), createOrderItemsCollection()],
      })

      client.updateOne.mockResolvedValueOnce({ id: 9, order_shop_id: 1, order_code: 'A' })

      const result: any = await runMonospaceOperation(client, 'updateItem', {
        collection: createOrderItemsCollection(),
        store,
        key: 9,
        item: { id: 9 },
        formOperations: [createFormOp('order', 'connect', { shop_id: 1, code: 'A' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('OrderItems', 9, {
        order_shop_id: 1,
        order_code: 'A',
      }, { fields: ['*'] })
      expect(result).toEqual({ id: 9, order_shop_id: 1, order_code: 'A' })
    })

    it('throws when the referenced columns cannot be resolved', async () => {
      await expect(runMonospaceOperation(client, 'createItem', {
        collection: createTodosCollection(),
        item: { title: 'A' },
        formOperations: [createFormOp('author', 'connect', { name: 'Jane' })],
      })).rejects.toThrow(/connect key column\(s\) "id"/)
      expect(client.createOne).not.toHaveBeenCalled()
    })
  })

  describe('raw relation payloads', () => {
    it('passes op-shaped payloads through untouched on update', async () => {
      const payload = [{ _connect: { key: { id: 'p9' } } }]
      client.updateOne.mockResolvedValueOnce({ id: 1 })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createTodosCollection(),
        key: 1,
        item: { id: 1, author: payload },
        formOperations: [createFormOp('author', 'set', payload, undefined)],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { author: [{ _connect: { key: { id: 'p9' } } }] }, { fields: ['*'] })
    })

    it('passes op-shaped payloads through untouched on create', async () => {
      const payload = { _create: { data: { title: 'Nested' } } }
      client.createOne.mockResolvedValueOnce({ id: 'p2' })

      await runMonospaceOperation(client, 'createItem', {
        collection: createProfilesCollection(),
        item: { name: 'John', todos: payload },
        formOperations: [createFormOp('todos', 'set', payload, undefined)],
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', { name: 'John', todos: { _create: { data: { title: 'Nested' } } } }, { fields: ['*'] })
    })
  })

  describe('fK columns in mutation bodies', () => {
    it('keeps FK columns and strips only primary keys from updateItem bodies', async () => {
      client.updateOne.mockResolvedValueOnce({ id: 1 })

      await runMonospaceOperation(client, 'updateItem', {
        collection: createTodosCollection(),
        key: 1,
        item: { id: 1, title: 'A', author_id: 'p1' },
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { title: 'A', author_id: 'p1' }, { fields: ['*'] })
    })

    it('keeps FK columns and strips only primary keys from updateMany bodies', async () => {
      client.updateOne.mockResolvedValue({ id: 1 })

      await runMonospaceOperation(client, 'updateMany', {
        collection: createTodosCollection(),
        items: [
          { id: 1, title: 'A', author_id: 'p1' },
          { id: 2, title: 'B', author_id: 'p2' },
        ],
      })

      expect(client.updateOne).toHaveBeenNthCalledWith(1, 'Todos', 1, { title: 'A', author_id: 'p1' }, { fields: ['*'] })
      expect(client.updateOne).toHaveBeenNthCalledWith(2, 'Todos', 2, { title: 'B', author_id: 'p2' }, { fields: ['*'] })
    })
  })
})
