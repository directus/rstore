import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
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

describe('createMonospaceRstorePlugin writes', () => {
  describe('create bodies', () => {
    it('translates FK columns into to-one _connect operations and omits null ones', async () => {
      client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'p1' })
      client.createMany.mockResolvedValueOnce([{ id: 6 }, { id: 7 }])

      // Monospace create inputs reject FK columns: the relation field
      // carries a single `_connect` object instead.
      await runMonospaceOperation(client, 'createItem', {
        collection: createTodosCollection(),
        item: { title: 'A', author_id: 'p1' },
      })
      await runMonospaceOperation(client, 'createMany', {
        collection: createTodosCollection(),
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
      client.createOne.mockResolvedValueOnce({ id: 'p1' })

      await runMonospaceOperation(client, 'createItem', {
        collection: createProfilesWithSettings(),
        item: { id: 'p1', name: 'Jane' },
      })

      expect(client.createOne).toHaveBeenCalledWith('Profiles', { id: 'p1', name: 'Jane' }, { fields: ['*'] })
    })
  })

  it('translates backward to-one form operations into nested operations', async () => {
    client.updateOne.mockResolvedValue({ id: 'p1' })

    // The FK lives on the Settings side: the parent primary key must never
    // be overwritten, Monospace links the related item instead.
    await runMonospaceOperation(client, 'updateItem', {
      collection: createProfilesWithSettings(),
      key: 'p1',
      item: { id: 'p1' },
      formOperations: [createFormOp('settings', 'connect', { id: 's1', profile_id: null })],
    })
    await runMonospaceOperation(client, 'updateItem', {
      collection: createProfilesWithSettings(),
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
      client.createOne.mockResolvedValueOnce({ profile_id: 'p1', theme: 'dark' })

      // The generated meta marks the relation as forward even though it
      // joins on exactly the source primary key.
      await runMonospaceOperation(client, 'createItem', {
        collection: createSettingsWithProfile(),
        item: { profile_id: 'p1', theme: 'dark' },
      })

      expect(client.createOne).toHaveBeenCalledWith('Settings', {
        theme: 'dark',
        profile: { _connect: { key: { id: 'p1' } } },
      }, { fields: ['*'] })
    })

    it('connects through the referenced columns for form connect on create', async () => {
      client.createOne.mockResolvedValueOnce({ profile_id: 'p1', theme: 'dark' })

      await runMonospaceOperation(client, 'createItem', {
        collection: createSettingsWithProfile(),
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
      client.updateOne.mockResolvedValueOnce({ shop_id: 1, code: 'A', total: 3 })

      const result = await runMonospaceOperation(client, 'updateItem', {
        collection: createOrdersCollection(),
        store: await createRelationStore(client, { collections: [createOrdersCollection()] }),
        key: '1::A',
        item: { shop_id: 1, code: 'A', total: 3 },
      })

      expect(client.updateOne).toHaveBeenCalledWith('Orders', { shop_id: 1, code: 'A' }, { total: 3 }, { fields: ['*'] })
      expect(result).toEqual({ shop_id: 1, code: 'A', total: 3 })
    })

    it('updates the explicit composite target when the patch carries a rival identity', async () => {
      const rows = [{ shop_id: 1, code: 'A', total: 1 }, { shop_id: 2, code: 'B', total: 2 }]
      const requests: any[] = []
      const store = await createRelationStore(client, {
        collections: [createOrdersCollection()],
        cacheItems: { Orders: [{ shop_id: 2, code: 'B', total: 2 }] },
      })

      /** Applies the external REST write to its addressed row, preserving request evidence. */
      async function persistOrderUpdate(collection: string, key: any, patch: any, query: any) {
        requests.push(structuredClone({ collection, key, patch, query }))
        const index = rows.findIndex(row => String(row.shop_id) === String(key.shop_id) && row.code === key.code)
        if (collection !== 'Orders' || index === -1) {
          throw new Error('Order not found')
        }
        rows[index] = { ...rows[index]!, ...patch }
        return { ...rows[index]! }
      }
      client.updateOne.mockImplementation(persistOrderUpdate)

      // No target cache entry or optimistic layer may mask key resolution.
      // Public updateItem accepts an explicit target independently of its patch.
      const item = { shop_id: 2, code: 'B', total: 3 }
      const result = await runMonospaceOperation(client, 'updateItem', {
        collection: createOrdersCollection(),
        store,
        key: '1::A',
        item,
        optimistic: false,
      })

      expect(requests).toEqual([{
        collection: 'Orders',
        key: { shop_id: '1', code: 'A' },
        patch: { total: 3 },
        query: { fields: ['*'] },
      }])
      expect(rows).toEqual([{ shop_id: 1, code: 'A', total: 3 }, { shop_id: 2, code: 'B', total: 2 }])
      expect(result).toEqual({ shop_id: 1, code: 'A', total: 3 })
      expect(store.$cache.getState().collections.Orders).toEqual({
        '1::A': { shop_id: 1, code: 'A', total: 3 },
        '2::B': { shop_id: 2, code: 'B', total: 2 },
      })
      expect(item).toEqual({ shop_id: 2, code: 'B', total: 3 })
    })

    it('deletes with the key column values resolved from the cache', async () => {
      const store = await createRelationStore(client, {
        collections: [createOrdersCollection()],
        cacheItems: { Orders: [{ shop_id: 1, code: 'A' }] },
      })

      // Non-optimistic mode keeps cached key column types available to the adapter.
      await runMonospaceOperation(client, 'deleteItem', { collection: createOrdersCollection(), store, key: '1::A', optimistic: false })

      expect(client.deleteOne).toHaveBeenCalledWith('Orders', { shop_id: 1, code: 'A' })
    })

    it('batches deleteMany into one filtered request, splitting uncached keys', async () => {
      await runMonospaceOperation(client, 'deleteMany', {
        collection: createOrdersCollection(),
        store: await createRelationStore(client, { collections: [createOrdersCollection()] }),
        keys: ['1::A', '2::B'],
      })

      expect(client.deleteOne).not.toHaveBeenCalled()
      expect(client.deleteMany).toHaveBeenCalledWith('Orders', {
        filter: {
          _or: expect.arrayContaining([
            { _and: expect.arrayContaining([{ shop_id: { _eq: '1' } }, { code: { _eq: 'A' } }]) },
            { _and: expect.arrayContaining([{ shop_id: { _eq: '2' } }, { code: { _eq: 'B' } }]) },
          ]),
        },
      })
      const groups = client.deleteMany.mock.lastCall![1].filter._or
      expect(groups).toHaveLength(2)
      expect(groups.map((group: any) => group._and.length)).toEqual([2, 2])
    })

    it('throws when the key cannot be resolved into column values', async () => {
      await expect(runMonospaceOperation(client, 'deleteItem', {
        collection: createOrdersCollection(),
        store: await createRelationStore(client, { collections: [createOrdersCollection()] }),
        key: 'broken',
      })).rejects.toThrow(/shop_id/)
      expect(client.deleteOne).not.toHaveBeenCalled()
    })
  })

  it('uses filtered requests for collections without item routes', async () => {
    const collection = createTodosCollection()
    collection.meta.monospace.itemRoutes = false
    client.updateOne.mockResolvedValue({ id: 1, title: 'A' })

    await runMonospaceOperation(client, 'updateMany', {
      collection,
      store: await createRelationStore(client, { collections: [collection] }),
      items: [{ id: 1, title: 'A' }],
    })
    await runMonospaceOperation(client, 'deleteItem', { collection, store: await createRelationStore(client, { collections: [collection] }), key: 1 })

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
