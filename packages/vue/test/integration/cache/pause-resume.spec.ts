import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'

describe('cache', () => {
  describe('pause/resume', () => {
    it('should queue writeItem operations when paused', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.pause()

      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Test' } })
      cache.writeItem({ collection, key: 2, item: { id: 2, name: 'Test 2' } })

      // Items should not be in cache yet
      expect(cache.readItem({ collection, key: 1 })).toBeUndefined()
      expect(cache.readItem({ collection, key: 2 })).toBeUndefined()

      cache.resume()

      // Items should now be in cache
      expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Test' })
      expect(cache.readItem({ collection, key: 2 })).toEqual({ id: 2, name: 'Test 2' })
    })

    it('should queue writeItems operations when paused', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.pause()

      cache.writeItems({
        collection,
        items: [
          { key: 1, value: { id: 1, name: 'Test' } },
          { key: 2, value: { id: 2, name: 'Test 2' } },
        ],
      })

      // Items should not be in cache yet
      expect(cache.readItem({ collection, key: 1 })).toBeUndefined()
      expect(cache.readItem({ collection, key: 2 })).toBeUndefined()

      cache.resume()

      // Items should now be in cache
      expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Test' })
      expect(cache.readItem({ collection, key: 2 })).toEqual({ id: 2, name: 'Test 2' })
    })

    it('should queue deleteItem operations when paused', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      // First write items
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Test' } })
      expect(cache.readItem({ collection, key: 1 })).toBeDefined()

      cache.pause()

      cache.deleteItem({ collection, key: 1 })

      // Item should still be in cache
      expect(cache.readItem({ collection, key: 1 })).toBeDefined()

      cache.resume()

      // Item should now be deleted
      expect(cache.readItem({ collection, key: 1 })).toBeUndefined()
    })

    it('should queue addLayer operations when paused', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Original' } })

      cache.pause()

      cache.addLayer({
        id: 'layer1',
        collectionName: 'TestCollection',
        state: { 1: { name: 'Modified' } },
        deletedItems: new Set(),
      })

      // Layer should not be applied yet
      const item = cache.readItem({ collection, key: 1 })
      expect(item?.name).toBe('Original')

      cache.resume()

      // Layer should now be applied
      const itemAfter = cache.readItem({ collection, key: 1 })
      expect(itemAfter?.name).toBe('Modified')
    })

    it('should queue removeLayer operations when paused', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Original' } })
      cache.addLayer({
        id: 'layer1',
        collectionName: 'TestCollection',
        state: { 1: { name: 'Modified' } },
        deletedItems: new Set(),
      })

      // Verify layer is applied
      expect(cache.readItem({ collection, key: 1 })?.name).toBe('Modified')

      cache.pause()

      cache.removeLayer('layer1')

      // Layer should still be applied
      expect(cache.readItem({ collection, key: 1 })?.name).toBe('Modified')

      cache.resume()

      // Layer should now be removed
      expect(cache.readItem({ collection, key: 1 })?.name).toBe('Original')
    })

    it('should maintain operation order when resuming', async () => {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.pause()

      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'First' } })
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Second' } })
      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Third' } })

      cache.resume()

      // Should have the last value
      expect(cache.readItem({ collection, key: 1 })?.name).toBe('Third')
    })
  })
})
