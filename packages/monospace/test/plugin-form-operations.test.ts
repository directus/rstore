import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
  createRelationStore,
  createTodosCollection,
  runHook,
  setupPlugin,
} from './utils/plugin'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin form relation operations', () => {
  describe('to-one relations', () => {
    it('writes the FK column for connect on create', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })

      // The form projection already wrote `author_id` on the body; the
      // adapter keeps it and emits no `_connect` operation, since the FK
      // column write alone is the canonical form.
      const result: any = await runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A', author_id: 'p1' },
        formOperations: [createFormOp('author', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', {
        title: 'A',
        author_id: 'p1',
      }, {})
      expect(result).toEqual({ id: 5, title: 'A', author_id: 'p1' })
    })

    it('resolves the FK column from the connect payload when missing from the body', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })

      await runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A' },
        formOperations: [createFormOp('author', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', {
        title: 'A',
        author_id: 'p1',
      }, {})
    })

    it('writes the FK column for connect on update', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: 'p1' })

      const result: any = await runHook(hooks.updateItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        key: 1,
        item: { id: 1, author_id: 'p1' },
        formOperations: [createFormOp('author', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
        author_id: 'p1',
      }, {})
      expect(result).toEqual({ id: 1, title: 'A', author_id: 'p1' })
    })

    it('nulls the FK column for disconnect on update', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: null })

      const result: any = await runHook(hooks.updateItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        key: 1,
        item: { id: 1, author_id: null },
        formOperations: [createFormOp('author', 'disconnect', undefined, undefined)],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
        author_id: null,
      }, {})
      expect(result).toEqual({ id: 1, title: 'A', author_id: null })
    })

    it('sends a null FK column for disconnect on create', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: null })

      await runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A', author_id: null },
        formOperations: [createFormOp('author', 'disconnect', undefined, undefined)],
      })

      // The null FK column is a valid create body field meaning "no author".
      expect(client.createOne).toHaveBeenCalledWith('Todos', { title: 'A', author_id: null }, {})
    })

    it('writes composite FK columns for connect', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore({
        collections: [createOrdersCollection(), createOrderItemsCollection()],
      })
      client.updateOne.mockResolvedValueOnce({ id: 9, order_shop_id: 1, order_code: 'A' })

      const result: any = await runHook(hooks.updateItem, {
        collection: createOrderItemsCollection(),
        store,
        key: 9,
        item: { id: 9 },
        formOperations: [createFormOp('order', 'connect', { shop_id: 1, code: 'A' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('OrderItems', 9, {
        order_shop_id: 1,
        order_code: 'A',
      }, {})
      expect(result).toEqual({ id: 9, order_shop_id: 1, order_code: 'A' })
    })

    it('throws when the referenced columns cannot be resolved', async () => {
      const hooks = setupPlugin(client)

      await expect(runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A' },
        formOperations: [createFormOp('author', 'connect', { name: 'Jane' })],
      })).rejects.toThrow(/connect key column\(s\) "id"/)
      expect(client.createOne).not.toHaveBeenCalled()
    })
  })

  describe('to-many relations', () => {
    it('translates connect ops and patches the target FK column in the cache', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore()
      client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

      await runHook(hooks.updateItem, {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'connect', { id: 3, title: 'C' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _connect: { keys: [{ id: 3 }] } }],
      }, {})
      // The connected todo's real FK column is patched in the cache so the
      // relation accessor resolves without a refetch.
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 3,
        item: { id: 3, author_id: 'p1' },
      })
    })

    it('translates a targeted disconnect into a keyed _disconnect filter', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore()
      client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

      await runHook(hooks.updateItem, {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'disconnect', undefined, { id: 2, title: 'B' })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: { filter: { id: 2 } } }],
      }, {})
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 2,
        item: { id: 2, author_id: null },
      })
    })

    it('combines multiple targeted disconnects into one _or filter', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runHook(hooks.updateItem, {
        collection: createProfilesCollection(),
        store: createRelationStore(),
        key: 'p1',
        item: {},
        formOperations: [
          createFormOp('todos', 'disconnect', undefined, { id: 1 }),
          createFormOp('todos', 'disconnect', undefined, { id: 2 }),
        ],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: { filter: { _or: [{ id: 1 }, { id: 2 }] } } }],
      }, {})
    })

    it('translates disconnect-all into an empty _disconnect and clears cached FK columns', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore({
        cacheItems: {
          Todos: [
            { id: 1, author_id: 'p1' },
            { id: 2, author_id: 'p1' },
            { id: 9, author_id: 'p2' },
          ],
        },
      })
      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runHook(hooks.updateItem, {
        collection: createProfilesCollection(),
        store,
        key: 'p1',
        item: {},
        formOperations: [createFormOp('todos', 'disconnect', [], [{ id: 1 }, { id: 2 }])],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
        todos: [{ _disconnect: {} }],
      }, {})
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 1,
        item: { id: 1, author_id: null },
      })
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 2,
        item: { id: 2, author_id: null },
      })
      expect(store.$cache.writeItem).not.toHaveBeenCalledWith(expect.objectContaining({ key: 9 }))
    })

    it('decomposes $set into connects and disconnects against the cache state', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore({
        cacheItems: {
          Todos: [
            { id: 1, author_id: 'p1' },
            { id: 2, author_id: 'p1' },
          ],
        },
      })
      client.updateOne.mockResolvedValueOnce({ id: 'p1' })

      await runHook(hooks.updateItem, {
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
      }, {})
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 1,
        item: { id: 1, author_id: null },
      })
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'Todos' }),
        key: 3,
        item: { id: 3, author_id: 'p1' },
      })
      // The kept item is left untouched.
      expect(store.$cache.writeItem).not.toHaveBeenCalledWith(expect.objectContaining({ key: 2 }))
    })

    it('connects all $set items with a single-op shape on create', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 'p2', name: 'John' })

      await runHook(hooks.createItem, {
        collection: createProfilesCollection(),
        store: createRelationStore(),
        item: { name: 'John' },
        formOperations: [createFormOp('todos', 'set', [{ id: 1 }, { id: 2 }], [])],
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', {
        name: 'John',
        todos: { _connect: { keys: [{ id: 1 }, { id: 2 }] } },
      }, {})
    })

    it('uses composite parent keys for FK column patches', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore({
        collections: [createOrdersCollection(), createOrderItemsCollection()],
      })
      client.updateOne.mockResolvedValueOnce({ shop_id: 1, code: 'A' })

      await runHook(hooks.updateItem, {
        collection: createOrdersCollection(),
        store,
        key: '1:A',
        item: {},
        formOperations: [createFormOp('items', 'connect', { id: 5 })],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Orders', '1:A', {
        items: [{ _connect: { keys: [{ id: 5 }] } }],
      }, {})
      expect(store.$cache.writeItem).toHaveBeenCalledWith({
        collection: expect.objectContaining({ name: 'OrderItems' }),
        key: 5,
        item: { id: 5, order_shop_id: 1, order_code: 'A' },
      })
    })
  })

  describe('raw relation payloads', () => {
    it('passes op-shaped payloads through untouched on update', async () => {
      const hooks = setupPlugin(client)
      const payload = [{ _connect: { key: { id: 'p9' } } }]
      client.updateOne.mockResolvedValueOnce({ id: 1 })

      await runHook(hooks.updateItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        key: 1,
        item: { id: 1, author: payload },
        formOperations: [createFormOp('author', 'set', payload, undefined)],
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { author: payload }, {})
    })

    it('passes op-shaped payloads through untouched on create', async () => {
      const hooks = setupPlugin(client)
      const payload = { _create: { data: { title: 'Nested' } } }
      client.createOne.mockResolvedValueOnce({ id: 'p2' })

      await runHook(hooks.createItem, {
        collection: createProfilesCollection(),
        store: createRelationStore(),
        item: { name: 'John', todos: payload },
        formOperations: [createFormOp('todos', 'set', payload, undefined)],
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', { name: 'John', todos: payload }, {})
    })
  })

  describe('fK columns in mutation bodies', () => {
    it('keeps FK columns in createItem bodies without form operations', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 5 })

      // FK columns are real, writable API fields: nothing is stripped.
      await runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A', author_id: 'p1' },
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', { title: 'A', author_id: 'p1' }, {})
    })

    it('keeps FK columns and strips only primary keys from updateItem bodies', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValueOnce({ id: 1 })

      await runHook(hooks.updateItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        key: 1,
        item: { id: 1, title: 'A', author_id: 'p1' },
      })

      expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, { title: 'A', author_id: 'p1' }, {})
    })

    it('keeps FK columns in createMany bodies', async () => {
      const hooks = setupPlugin(client)
      client.createMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

      await runHook(hooks.createMany, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        items: [
          { title: 'A', author_id: 'p1' },
          { title: 'B', author_id: null },
        ],
      })

      expect(client.createMany).toHaveBeenCalledWith('Todos', [
        { title: 'A', author_id: 'p1' },
        { title: 'B', author_id: null },
      ], {})
    })

    it('keeps FK columns and strips only primary keys from updateMany bodies', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValue({ id: 1 })

      await runHook(hooks.updateMany, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        items: [
          { key: 1, item: { id: 1, title: 'A', author_id: 'p1' } },
          { key: 2, item: { id: 2, title: 'B', author_id: 'p2' } },
        ],
      })

      expect(client.updateOne).toHaveBeenNthCalledWith(1, 'Todos', 1, { title: 'A', author_id: 'p1' }, {})
      expect(client.updateOne).toHaveBeenNthCalledWith(2, 'Todos', 2, { title: 'B', author_id: 'p2' }, {})
    })
  })
})
