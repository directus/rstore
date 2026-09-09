import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'

describe('cache', () => {
  const mockItem = { id: 1, name: 'Test Item' }

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

    const item = store.TestCollection.peekFirst(1)!
    expect(item).toMatchObject({ id: 1, name: 'Test Item', relatedId: 2 })
    expect(item.related).toEqual({ id: 2, name: 'Related Item' })
    expect(store.RelatedCollection.peekFirst(2)).toEqual(item.related)
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

    const item = store.TestCollection.peekFirst(0)!
    expect(item).toMatchObject({ id: 0, name: 'Test Item', relatedId: 0 })
    expect(item.related).toEqual({ id: 0, name: 'Related Item' })
    expect(store.RelatedCollection.peekFirst(0)).toEqual(item.related)
  })

  it('should remove items from index buckets when an indexed field is written as null', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'Author',
          relations: {
            posts: { to: { Post: { on: { authorId: 'id' } } }, many: true },
          },
        },
        { name: 'Post' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const postCollection = store.$collections.find(collection => collection.name === 'Post')!

    cache.writeItem({ collection: postCollection, key: 1, item: { id: 1, title: 'Post', authorId: 'a1' } })
    expect(readPostsByAuthor()).toEqual([1])

    // A partial write without the indexed field keeps the previous bucket.
    cache.writeItem({ collection: postCollection, key: 1, item: { title: 'Renamed' } })
    expect(readPostsByAuthor()).toEqual([1])

    // An explicit null must remove the item from the bucket, not fall back
    // to the previous value.
    cache.writeItem({ collection: postCollection, key: 1, item: { authorId: null } })
    expect(readPostsByAuthor()).toEqual([])

    function readPostsByAuthor() {
      return cache.readItems({
        collection: postCollection,
        indexKey: 'authorId',
        indexValue: 'a1',
      }).map(item => item.id)
    }
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
      schema: [{
        name: 'TestCollection',
        computed: {
          upperLabel: (item: { label: string }) => item.label.toUpperCase(),
        },
      }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'Meow' }, marker: 'testMarker' })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'Woof' }, marker: 'testMarker' })

    const items = cache.readItems({ collection, marker: 'testMarker', filter: item => item.label === 'Meow' })
    const items2 = cache.readItems({ collection, marker: 'testMarker', filter: item => item.label === 'Woof' })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 1, label: 'Meow' })

    expect(items2).toHaveLength(1)
    expect(items2[0]).toMatchObject({ id: 2, label: 'Woof' })

    const wrappedItems = cache.readItems({
      collection,
      marker: 'testMarker',
      filter: item => item.$getKey() === 1 && item.upperLabel === 'MEOW',
    })
    expect(wrappedItems).toHaveLength(1)
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
})
