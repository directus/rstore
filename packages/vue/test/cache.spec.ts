import type { CacheLayer } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { createStore } from '../src'

describe('cache', () => {
  const mockItem = { id: 1, name: 'Test Item' }

  it('should write an item to the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: mockItem })

    const state = cache.getState() as any
    expect(state.collections.TestCollection[1]).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should not write special keys', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: {
      ...mockItem,
      $special: true,
    } })

    const state = cache.getState() as any
    expect(state.collections.TestCollection[1]).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should read an item from the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const result = cache.readItem({ collection, key: 1 })
    expect(result).toBeDefined()
    expect(result).toEqual(mockItem)
  })

  it('should return a wrapped item', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const result = cache.readItem({ collection, key: 1 })
    expect(result?.$collection).toBe(collection.name)
  })

  it('should delete an item from the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })
    cache.deleteItem({ collection, key: 1 })

    const state = cache.getState() as any
    expect(state.collections.TestCollection).toEqual({})
  })

  it('should clear the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: mockItem })
    cache.clear()

    const state = cache.getState()
    expect(state).toEqual({
      collections: {
        TestCollection: {},
      },
      markers: {},
      modules: {},
      queryMeta: {},
    })
  })

  it('should handle relations when writing items', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'TestCollection',
          relations: {
            related: { to: { RelatedCollection: { on: { id: 'relatedId' } } }, many: false },
          },
        },
        { name: 'RelatedCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache

    const relatedItem = { id: 2, name: 'Related Item' }
    const itemWithRelation = { id: 1, name: 'Test Item', relatedId: relatedItem.id, related: relatedItem }

    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: itemWithRelation })

    const state = cache.getState() as any
    expect(state.collections.TestCollection[1]).toEqual({ id: 1, name: 'Test Item', relatedId: 2 })
    expect(state.collections.RelatedCollection[2]).toEqual({ id: 2, name: 'Related Item' })
  })

  it('should write items with falsy keys', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'TestCollection',
          relations: {
            related: { to: { RelatedCollection: { on: { id: 'relatedId' } } }, many: false },
          },
        },
        { name: 'RelatedCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache

    const relatedItem = { id: 0, name: 'Related Item' }
    const itemWithRelation = { id: 0, name: 'Test Item', relatedId: relatedItem.id, related: relatedItem }

    cache.writeItem({ collection: store.$collections[0]!, key: 0, item: itemWithRelation })

    const state = cache.getState() as any
    expect(state.collections.TestCollection[0]).toEqual({ id: 0, name: 'Test Item', relatedId: 0 })
    expect(state.collections.RelatedCollection[0]).toEqual({ id: 0, name: 'Related Item' })
  })

  it('should mark a marker when writing items', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: mockItem, marker: 'testMarker' })

    const state = cache.getState() as any
    expect(state.markers.testMarker).toBe(true)
  })

  it('should read items by marker', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'testMarker' })
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(mockItem)
  })

  it('should not read items if marker is not set', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'otherMarker' })
    expect(items).toHaveLength(0)
  })

  it('should filter the items', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'Meow' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'Woof' }, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'testMarker', filter: item => item.label === 'Meow' })
    const items2 = cache.readItems({ collection, marker: 'testMarker', filter: item => item.label === 'Woof' })

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 1, label: 'Meow' })

    expect(items2).toHaveLength(1)
    expect(items2[0]).toEqual({ id: 2, label: 'Woof' })
  })

  it('should limit the number of items', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'Item 1' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'Item 2' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 3, item: { id: 3, label: 'Item 3' }, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'testMarker', limit: 2 })
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ id: 1, label: 'Item 1' })
    expect(items[1]).toEqual({ id: 2, label: 'Item 2' })
  })

  it('should filter and limit the items', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'Meow' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'Woof' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 3, item: { id: 3, label: 'Meow' }, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'testMarker', filter: item => item.label === 'Meow', limit: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({ id: 1, label: 'Meow' })
  })

  it('should garbage collect an item that is not referenced by any query', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const item = cache.readItem({ collection, key: 1 })!
    expect(item.$meta.queries.size).toBe(0)

    cache.garbageCollectItem({ collection, item })

    const item2 = cache.readItem({ collection, key: 1 })
    expect(item2).toBeUndefined()
  })

  it('should not garbage collect an item that is referenced by a query', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const item = cache.readItem({ collection, key: 1 })!
    item.$meta.queries.add('testQuery')

    cache.garbageCollectItem({ collection, item })

    const item2 = cache.readItem({ collection, key: 1 })
    expect(item2).toBeDefined()
  })

  it('should garbage collect all items that are not referenced by any query', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, name: 'item 1' } })
    cache.writeItem({ collection, key: 2, item: { id: 2, name: 'item 2' } })
    cache.writeItem({ collection, key: 3, item: { id: 3, name: 'item 3' } })

    // Reference item 2
    const item2 = cache.readItem({ collection, key: 2 })!
    item2.$meta.queries.add('testQuery')

    let state = cache.getState() as any
    expect(state.collections.TestCollection[1]).toBeDefined()
    expect(state.collections.TestCollection[2]).toBeDefined()
    expect(state.collections.TestCollection[3]).toBeDefined()

    cache.garbageCollect()

    state = cache.getState() as any
    expect(state.collections.TestCollection[1]).toBeUndefined()
    expect(state.collections.TestCollection[2]).toBeDefined()
    expect(state.collections.TestCollection[3]).toBeUndefined()
  })

  describe('layers', () => {
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
