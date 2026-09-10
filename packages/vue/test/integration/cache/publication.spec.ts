import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache writeItems', () => {
  it('publishes 1000 items once to a warmed reactive collection reader', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const items = Array.from({ length: 1000 }, (_, index) => ({
      key: index + 1,
      value: { id: index + 1, name: `Item ${index + 1}` },
    }))

    // Prime the overlay cache before subscribing. Cached readers still need to
    // subscribe to the collection publication used by batched writes.
    expect(cache.readItems({ collection })).toEqual([])

    const observedLengths: number[] = []
    const stop = watchSyncEffect(() => {
      observedLengths.push(cache.readItems({ collection }).length)
    })

    try {
      cache.writeItems({ collection, items })

      expect(observedLengths).toEqual([0, 1000])
    }
    finally {
      stop()
    }
  })

  it('keeps individual writeItem publication immediate', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    let observedLength = -1
    const stop = watchSyncEffect(() => {
      observedLength = cache.readItems({ collection }).length
    })

    try {
      cache.writeItem({ collection, key: 1, item: { id: 1 } })
      expect(observedLength).toBe(1)

      cache.writeItem({ collection, key: 2, item: { id: 2 } })
      expect(observedLength).toBe(2)
    }
    finally {
      stop()
    }
  })

  it('marks before publication and runs the outer hook after publication', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const events: string[] = []
    const stop = watchSyncEffect(() => {
      const allItems = cache.readItems({ collection })
      const markedItems = cache.readItems({ collection, marker: 'test-marker' })
      events.push(`reactive:${allItems.length}:${markedItems.length}`)
    })
    store.$hooks.hook('afterCacheWrite', ({ marker, result }) => {
      const markedItems = cache.readItems({ collection, marker: 'test-marker' })
      events.push(`hook:${marker}:${Array.isArray(result) ? result.length : 1}:${markedItems.length}`)
    })

    try {
      cache.writeItems({
        collection,
        marker: 'test-marker',
        items: [
          { key: 1, value: { id: 1 } },
          { key: 2, value: { id: 2 } },
        ],
      })

      expect(events).toEqual([
        'reactive:0:0',
        'reactive:2:2',
        'hook:test-marker:2:2',
      ])
    }
    finally {
      stop()
    }
  })

  it('publishes once to an existing wrapped item', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Before' } })
    const wrappedItem = cache.readItem({ collection, key: 1 })!
    const observedNames: string[] = []
    const stop = watchSyncEffect(() => {
      observedNames.push(wrappedItem.name)
    })

    try {
      cache.writeItems({
        collection,
        items: [
          { key: 1, value: { id: 1, name: 'Intermediate' } },
          { key: 1, value: { id: 1, name: 'After' } },
        ],
      })

      expect(observedNames).toEqual(['Before', 'After'])
      expect(cache.readItem({ collection, key: 1 })).toBe(wrappedItem)
    }
    finally {
      stop()
    }
  })

  it('publishes once when collection layers are active', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Base' } })
    cache.addLayer({
      id: 'test-layer',
      collectionName: collection.name,
      state: { 1: { name: 'Layered' } },
      deletedItems: new Set(),
    })
    expect(cache.readItems({ collection }).map(item => item.name)).toEqual(['Layered'])

    const observedNames: string[][] = []
    const stop = watchSyncEffect(() => {
      observedNames.push(cache.readItems({ collection }).map(item => item.name))
    })

    try {
      cache.writeItems({
        collection,
        items: [
          { key: 1, value: { id: 1, name: 'Updated base' } },
          { key: 2, value: { id: 2, name: 'Second item' } },
        ],
      })

      expect(observedNames).toEqual([
        ['Layered'],
        ['Layered', 'Second item'],
      ])
    }
    finally {
      stop()
    }
  })

  it('publishes nested collections before draining child hooks and the outer hook', async () => {
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
    const collection = store.$collections[0]!
    const relatedCollection = store.$collections[1]!
    const observedParentLengths: number[] = []
    const observedRelatedLengths: number[] = []
    const observedRelationNames: string[][] = []
    const events: string[] = []
    const stopParents = watchSyncEffect(() => {
      const length = cache.readItems({ collection }).length
      observedParentLengths.push(length)
      events.push(`parent-reactive:${length}`)
    })
    const stopRelated = watchSyncEffect(() => {
      const length = cache.readItems({ collection: relatedCollection }).length
      observedRelatedLengths.push(length)
      events.push(`related-reactive:${length}`)
    })
    const stopRelations = watchSyncEffect(() => {
      observedRelationNames.push(cache.readItems({ collection }).map(item => (item as any).related?.name))
    })
    store.$hooks.hook('afterCacheWrite', ({ collection: hookCollection, key, result }) => {
      if (hookCollection.name === relatedCollection.name) {
        events.push(`child:${key}:${observedParentLengths.at(-1)}:${observedRelatedLengths.at(-1)}`)
      }
      else if (hookCollection.name === collection.name && Array.isArray(result) && result.length === 2) {
        events.push(`outer:${observedParentLengths.at(-1)}:${observedRelatedLengths.at(-1)}`)
      }
    })

    try {
      cache.writeItems({
        collection,
        items: [
          {
            key: 1,
            value: {
              id: 1,
              relatedId: 11,
              related: { id: 11, name: 'Related 1' },
            },
          },
          {
            key: 2,
            value: {
              id: 2,
              relatedId: 12,
              related: { id: 12, name: 'Related 2' },
            },
          },
        ],
      })

      expect(observedParentLengths).toEqual([0, 2])
      expect(observedRelatedLengths).toEqual([0, 2])
      expect(events).toEqual([
        'parent-reactive:0',
        'related-reactive:0',
        'parent-reactive:2',
        'related-reactive:2',
        'child:11:2:2',
        'child:12:2:2',
        'outer:2:2',
      ])
      expect(observedRelationNames[0]).toEqual([])
      expect(observedRelationNames.length).toBeGreaterThan(1)
      for (const relationNames of observedRelationNames.slice(1)) {
        expect(relationNames).toEqual(['Related 1', 'Related 2'])
      }
      expect(cache.readItems({
        collection: relatedCollection,
        indexKey: 'id',
        indexValue: '11',
      }).map(item => item.name)).toEqual(['Related 1'])
    }
    finally {
      stopParents()
      stopRelated()
      stopRelations()
    }
  })
})
