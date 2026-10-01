import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
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

describe('createMonospaceRstorePlugin writes', () => {
  describe('create bodies', () => {
    it('translates FK columns into to-one _connect operations and omits null ones', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })
      client.createMany.mockResolvedValueOnce([{ id: 6 }, { id: 7 }])

      // Monospace create inputs reject FK columns: the relation field
      // carries a single `_connect` object instead.
      await runHook(hooks.createItem, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        item: { title: 'A', author_id: 'p1' },
      })
      await runHook(hooks.createMany, {
        collection: createTodosCollection(),
        store: createRelationStore(),
        items: [
          { title: 'B', author_id: 'p2' },
          { title: 'C', author_id: null },
        ],
      })

      expect(client.createOne).toHaveBeenCalledWith('Todos', {
        title: 'A',
        author: { _connect: { key: { id: 'p1' } } },
      }, { fields: ['*'] })
      expect(client.createMany).toHaveBeenCalledWith('Todos', [
        { title: 'B', author: { _connect: { key: { id: 'p2' } } } },
        { title: 'C' },
      ], { fields: ['*'] })
    })

    it('keeps source primary keys joined by backward to-one relations', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ id: 'p1' })

      await runHook(hooks.createItem, {
        collection: createProfilesWithSettings(),
        store: createRelationStore(),
        item: { id: 'p1', name: 'Jane' },
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', { id: 'p1', name: 'Jane' }, { fields: ['*'] })
    })
  })

  it('translates backward to-one form operations into nested operations', async () => {
    const hooks = setupPlugin(client)
    client.updateOne.mockResolvedValue({ id: 'p1' })

    // The FK lives on the Settings side: the parent primary key must never
    // be overwritten, Monospace links the related item instead.
    await runHook(hooks.updateItem, {
      collection: createProfilesWithSettings(),
      store: createRelationStore(),
      key: 'p1',
      item: { id: 'p1' },
      formOperations: [createFormOp('settings', 'connect', { id: 's1', profile_id: null })],
    })
    await runHook(hooks.updateItem, {
      collection: createProfilesWithSettings(),
      store: createRelationStore(),
      key: 'p1',
      item: { id: 'p1' },
      formOperations: [createFormOp('settings', 'disconnect', undefined, { id: 's1' })],
    })

    expect(client.updateOne).toHaveBeenNthCalledWith(1, 'Profiles', 'p1', {
      settings: [{ _connect: { key: { id: 's1' } } }],
    }, { fields: ['*'] })
    expect(client.updateOne).toHaveBeenNthCalledWith(2, 'Profiles', 'p1', {
      settings: [{ _disconnect: {} }],
    }, { fields: ['*'] })
  })

  describe('one-to-one relations whose FK is the primary key', () => {
    it('translates the FK primary key column into a _connect operation on create', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ profile_id: 'p1', theme: 'dark' })

      // The generated meta marks the relation as forward even though it
      // joins on exactly the source primary key.
      await runHook(hooks.createItem, {
        collection: createSettingsWithProfile(),
        store: createRelationStore(),
        item: { profile_id: 'p1', theme: 'dark' },
      })

      expect(client.createOne).toHaveBeenCalledWith('Settings', {
        theme: 'dark',
        profile: { _connect: { key: { id: 'p1' } } },
      }, { fields: ['*'] })
    })

    it('connects through the referenced columns for form connect on create', async () => {
      const hooks = setupPlugin(client)
      client.createOne.mockResolvedValueOnce({ profile_id: 'p1', theme: 'dark' })

      await runHook(hooks.createItem, {
        collection: createSettingsWithProfile(),
        store: createRelationStore(),
        item: { profile_id: 'p1', theme: 'dark' },
        formOperations: [createFormOp('profile', 'connect', { id: 'p1', name: 'Jane' })],
      })

      expect(client.createOne).toHaveBeenCalledWith('Settings', {
        theme: 'dark',
        profile: { _connect: { key: { id: 'p1' } } },
      }, { fields: ['*'] })
    })
  })

  describe('composite primary keys', () => {
    it('updates with the key column values resolved from the item', async () => {
      const hooks = setupPlugin(client)
      client.updateOne.mockResolvedValueOnce({ shop_id: 1, code: 'A', total: 3 })

      const result = await runHook(hooks.updateItem, {
        collection: createOrdersCollection(),
        store: createRelationStore({ collections: [createOrdersCollection()] }),
        key: '1::A',
        item: { shop_id: 1, code: 'A', total: 3 },
      })

      expect(client.updateOne).toHaveBeenCalledWith('Orders', { shop_id: 1, code: 'A' }, { total: 3 }, { fields: ['*'] })
      expect(result).toEqual({ shop_id: 1, code: 'A', total: 3 })
    })

    it('deletes with the key column values resolved from the cache', async () => {
      const hooks = setupPlugin(client)
      const store = createRelationStore({
        collections: [createOrdersCollection()],
        cacheItems: { Orders: [{ shop_id: 1, code: 'A' }] },
      })

      await runHook(hooks.deleteItem, { collection: createOrdersCollection(), store, key: '1::A' })

      expect(client.deleteOne).toHaveBeenCalledWith('Orders', { shop_id: 1, code: 'A' })
    })

    it('batches deleteMany into one filtered request, splitting uncached keys', async () => {
      const hooks = setupPlugin(client)

      await runHook(hooks.deleteMany, {
        collection: createOrdersCollection(),
        store: createRelationStore({ collections: [createOrdersCollection()] }),
        keys: ['1::A', '2::B'],
      })

      expect(client.deleteOne).not.toHaveBeenCalled()
      expect(client.deleteMany).toHaveBeenCalledWith('Orders', {
        filter: {
          _or: [
            { _and: [{ shop_id: { _eq: '1' } }, { code: { _eq: 'A' } }] },
            { _and: [{ shop_id: { _eq: '2' } }, { code: { _eq: 'B' } }] },
          ],
        },
      })
    })

    it('throws when the key cannot be resolved into column values', async () => {
      const hooks = setupPlugin(client)

      await expect(runHook(hooks.deleteItem, {
        collection: createOrdersCollection(),
        store: createRelationStore({ collections: [createOrdersCollection()] }),
        key: 'broken',
      })).rejects.toThrow(/shop_id/)
      expect(client.deleteOne).not.toHaveBeenCalled()
    })
  })

  it('uses filtered requests for collections without item routes', async () => {
    const hooks = setupPlugin(client)
    const collection = createTodosCollection()
    collection.meta.monospace.itemRoutes = false
    client.updateOne.mockResolvedValue({ id: 1, title: 'A' })

    await runHook(hooks.updateMany, {
      collection,
      store: createRelationStore({ collections: [collection] }),
      items: [{ key: 1, item: { id: 1, title: 'A' } }],
    })
    await runHook(hooks.deleteItem, { collection, store: createRelationStore({ collections: [collection] }), key: 1 })

    expect(client.updateOne).toHaveBeenCalledWith('Todos', { id: 1 }, { title: 'A' }, { fields: ['*'] })
    expect(client.deleteOne).toHaveBeenCalledWith('Todos', { id: 1 })
  })
})

/**
 * Creates Profiles with a backward to-one `settings` relation whose FK
 * column (`profile_id`) is owned by the Settings collection.
 */
function createProfilesWithSettings(): any {
  const profiles = createProfilesCollection()
  profiles.normalizedRelations.settings = {
    many: false,
    to: [{ collection: 'Settings', on: { profile_id: 'id' } }],
  }
  return profiles
}

/**
 * Creates Settings sharing its primary key with Profiles: the `profile_id`
 * primary key column is also the FK of the forward to-one `profile`
 * relation, as declared by the generated relation meta.
 */
function createSettingsWithProfile(): any {
  return {
    name: 'Settings',
    meta: {
      primaryKeys: ['profile_id'],
      monospace: {
        collection: 'Settings',
        relations: { profile: { connectKeys: ['id'], forward: true } },
      },
    },
    getKey: (item: any) => item.profile_id,
    normalizedRelations: {
      profile: {
        many: false,
        to: [{ collection: 'Profiles', on: { id: 'profile_id' } }],
      },
    },
  }
}
