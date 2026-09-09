import type { CacheLayer } from '@rstore/shared'
import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache', () => {
  describe('layers', () => {
    it('keeps layered reads fresh when a sync reader runs during a write', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.addLayer({
        id: 'empty-layer',
        collectionName: 'TestCollection',
        state: {},
        deletedItems: new Set(),
      })

      const stop = watchSyncEffect(() => {
        cache.readItems({ collection })
      })

      try {
        cache.writeItem({
          collection,
          key: 1,
          item: { id: 1, name: 'item1' },
        })

        expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'item1' })
        expect(cache.readItems({ collection })).toHaveLength(1)
      }
      finally {
        stop()
      }
    })

    it('should add a new item from a layer', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'item1' } })

      expect(cache.readItems({ collection })).toHaveLength(1)

      const layer: CacheLayer = {
        id: 'layer1',
        collectionName: 'TestCollection',
        state: {
          2: { id: 2, name: 'item2' },
        },
        deletedItems: new Set(),
      }
      cache.addLayer(layer)

      const items = cache.readItems({ collection })
      expect(items).toHaveLength(2)
      expect(items.find(i => i.id === 1)).toBeDefined()
      expect(items.find(i => i.id === 2)).toBeDefined()

      cache.removeLayer('layer1')

      const itemsAfter = cache.readItems({ collection })
      expect(itemsAfter).toHaveLength(1)
      expect(itemsAfter.find(i => i.id === 1)).toBeDefined()
      expect(itemsAfter.find(i => i.id === 2)).toBeUndefined()
    })

    it('should modify an existing item from a layer', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'item1' } })

      expect(cache.readItems({ collection })[0]!.name).toBe('item1')

      const layer: CacheLayer = {
        id: 'layer1',
        collectionName: 'TestCollection',
        state: {
          1: { id: 1, name: 'modified item1' },
        },
        deletedItems: new Set(),
      }
      cache.addLayer(layer)

      expect(cache.readItems({ collection })[0]!.name).toBe('modified item1')

      cache.removeLayer('layer1')

      expect(cache.readItems({ collection })[0]!.name).toBe('item1')
    })

    it('should delete an existing item from a layer', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'item1' } })
      cache.writeItem({ collection, key: 2, item: { id: 2, name: 'item2' } })

      expect(cache.readItems({ collection })).toHaveLength(2)

      const layer: CacheLayer = {
        id: 'layer1',
        collectionName: 'TestCollection',
        state: {},
        deletedItems: new Set([2]),
      }
      cache.addLayer(layer)

      const items = cache.readItems({ collection })
      expect(items).toHaveLength(1)
      expect(items[0]!.id).toBe(1)

      cache.removeLayer('layer1')

      const itemsAfter = cache.readItems({ collection })
      expect(itemsAfter).toHaveLength(2)
      expect(itemsAfter.find(i => i.id === 1)).toBeDefined()
      expect(itemsAfter.find(i => i.id === 2)).toBeDefined()
    })

    it('should read items from layer in relation', async () => {
      const store = await createStore({
        schema: [
          {
            name: 'CollectionA',
            relations: {
              relatedItems: {
                to: {
                  CollectionB: {
                    on: {
                      foreignKey: 'id',
                    },
                  },
                },
                many: true,
              },
            },
          },
          { name: 'CollectionB' },
        ],
        plugins: [],
      })
      const cache = store.$cache

      // Write initial items
      cache.writeItem({
        collection: store.$collections[0]!,
        item: { id: 1 },
        key: 1,
      })

      cache.addLayer({
        id: 'layer1',
        collectionName: 'CollectionB',
        state: {
          2: { id: 2, foreignKey: 1 },
          3: { id: 3, foreignKey: 1 },
        },
        deletedItems: new Set(),
      })

      const wrappedItem = cache.readItem({
        collection: store.$collections[0]!,
        key: 1,
      }) as any

      expect(wrappedItem.relatedItems?.length).toBe(2)
      expect(wrappedItem.relatedItems[0].id).toBe(2)
      expect(wrappedItem.relatedItems[1].id).toBe(3)

      cache.removeLayer('layer1')

      expect(wrappedItem.relatedItems?.length).toBe(0)
    })
  })
})
