import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache writeItems', () => {
  it('keeps staggered slices unpublished until the batch completes', async () => {
    vi.useFakeTimers()

    try {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
        cacheStaggering: 2,
      })
      const cache = store.$cache
      const collection = store.$collections[0]!
      const observedLengths: number[] = []
      const stop = watchSyncEffect(() => {
        observedLengths.push(cache.readItems({ collection }).length)
      })

      try {
        cache.writeItems({
          collection,
          marker: 'testMarker',
          items: Array.from({ length: 5 }, (_, index) => ({
            key: index + 1,
            value: { id: index + 1, name: `Item ${index + 1}` },
          })),
        })

        expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Item 1' })
        expect(cache.readItem({ collection, key: 2 })).toEqual({ id: 2, name: 'Item 2' })
        expect(cache.readItem({ collection, key: 3 })).toBeUndefined()
        expect(cache.readItems({ collection, marker: 'testMarker' })).toHaveLength(0)
        expect(observedLengths).toEqual([0])

        vi.advanceTimersByTime(10)

        expect(cache.readItem({ collection, key: 3 })).toEqual({ id: 3, name: 'Item 3' })
        expect(cache.readItem({ collection, key: 4 })).toEqual({ id: 4, name: 'Item 4' })
        expect(cache.readItem({ collection, key: 5 })).toBeUndefined()
        expect(cache.readItems({ collection, marker: 'testMarker' })).toHaveLength(0)
        expect(observedLengths).toEqual([0])

        vi.advanceTimersByTime(10)

        expect(cache.readItem({ collection, key: 5 })).toEqual({ id: 5, name: 'Item 5' })
        expect(cache.readItems({ collection, marker: 'testMarker' })).toHaveLength(5)
        expect(observedLengths).toEqual([0, 5])
      }
      finally {
        stop()
      }
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('settles an already-written stale slice without marking or emitting the outer batch hook', async () => {
    vi.useFakeTimers()

    try {
      const store = await createStore({
        schema: [
          {
            name: 'Parent',
            relations: {
              child: { to: { Child: { on: { id: 'childId' } } }, many: false },
            },
          },
          { name: 'Child' },
        ],
        plugins: [],
        cacheStaggering: 1,
      })
      const cache = store.$cache
      const parentCollection = store.$collections[0]!
      const childCollection = store.$collections[1]!
      const parentLengths: number[] = []
      const childLengths: number[] = []
      const hookEvents: string[] = []
      let canPublish = true
      const stopParent = watchSyncEffect(() => {
        parentLengths.push(cache.readItems({ collection: parentCollection }).length)
      })
      const stopChild = watchSyncEffect(() => {
        childLengths.push(cache.readItems({ collection: childCollection }).length)
      })
      store.$hooks.hook('afterCacheWrite', ({ collection, key, result }) => {
        if (collection.name === childCollection.name) {
          hookEvents.push(`${collection.name}:${key}`)
        }
        else if (collection.name === parentCollection.name && Array.isArray(result)) {
          hookEvents.push('outer')
        }
      })

      try {
        cache.writeItems({
          collection: parentCollection,
          marker: 'stale-marker',
          meta: { $canPublishQuery: () => canPublish },
          items: [
            {
              key: 1,
              value: {
                id: 1,
                childId: 11,
                child: { id: 11, name: 'Already written child' },
              },
            },
            { key: 2, value: { id: 2 } },
          ],
        })

        canPublish = false
        vi.advanceTimersByTime(10)

        expect(parentLengths).toEqual([0, 1])
        expect(childLengths).toEqual([0, 1])
        expect(cache.readItems({ collection: parentCollection }).map(item => item.id)).toEqual([1])
        expect(cache.readItems({ collection: childCollection }).map(item => item.id)).toEqual([11])
        expect(cache.readItems({ collection: parentCollection, marker: 'stale-marker' })).toEqual([])
        expect(hookEvents).toEqual(['Child:11'])
      }
      finally {
        stopParent()
        stopChild()
      }
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('settles a staggered nested failure before corrected retry and later work progress', async () => {
    vi.useFakeTimers()

    try {
      const store = await createStore({
        schema: [
          {
            name: 'Parent',
            relations: {
              related: { to: { Related: { on: { id: 'relatedId' } } }, many: false },
              other: { to: { Other: { on: { id: 'otherId' } } }, many: false },
            },
          },
          { name: 'Related' },
          { name: 'Other' },
          { name: 'Independent' },
        ],
        plugins: [],
        cacheStaggering: 1,
      })
      const cache = store.$cache
      const parentCollection = store.$collections[0]!
      const relatedCollection = store.$collections[1]!
      const otherCollection = store.$collections[2]!
      const independentCollection = store.$collections[3]!
      const items: Array<{ key: number, value: any }> = [
        { key: 1, value: { id: 1, name: 'First' } },
        {
          key: 2,
          value: {
            id: 2,
            relatedId: 11,
            related: { id: 11, name: 'Related' },
            otherId: 21,
            other: [{ id: 21, name: 'Invalid to-one value' }],
          },
        },
      ]
      const parentLengths: number[] = []
      const relatedLengths: number[] = []
      const otherLengths: number[] = []
      const hookSnapshots: string[] = []
      const stopParent = watchSyncEffect(() => {
        parentLengths.push(cache.readItems({ collection: parentCollection }).length)
      })
      const stopRelated = watchSyncEffect(() => {
        relatedLengths.push(cache.readItems({ collection: relatedCollection }).length)
      })
      const stopOther = watchSyncEffect(() => {
        otherLengths.push(cache.readItems({ collection: otherCollection }).length)
      })
      store.$hooks.hook('afterCacheWrite', ({ collection, result }) => {
        if (collection.name === relatedCollection.name || collection.name === otherCollection.name) {
          hookSnapshots.push(`${collection.name}:${parentLengths.at(-1)}:${relatedLengths.at(-1)}:${otherLengths.at(-1)}`)
        }
        else if (collection.name === parentCollection.name && Array.isArray(result) && result.length === items.length) {
          hookSnapshots.push(`outer:${parentLengths.at(-1)}:${relatedLengths.at(-1)}:${otherLengths.at(-1)}`)
        }
      })

      try {
        cache.writeItems({ collection: parentCollection, items })

        expect(parentLengths).toEqual([0])
        expect(relatedLengths).toEqual([0])
        expect(otherLengths).toEqual([0])

        expect(() => vi.advanceTimersByTime(10)).toThrow('Expected object for relation Parent.other')

        expect(parentLengths).toEqual([0, 1])
        expect(relatedLengths).toEqual([0, 1])
        expect(otherLengths).toEqual([0])
        expect(hookSnapshots).toEqual(['Related:1:1:0'])

        items[1]!.value.other = { id: 21, name: 'Valid on retry' }
        cache.writeItem({
          collection: independentCollection,
          key: 1,
          item: { id: 1, name: 'Later queued write' },
        })

        expect(parentLengths).toEqual([0, 1, 2])
        expect(relatedLengths).toEqual([0, 1, 1])
        expect(otherLengths).toEqual([0, 1])
        expect(hookSnapshots).toEqual([
          'Related:1:1:0',
          'Related:2:1:1',
          'Other:2:1:1',
          'outer:2:1:1',
        ])
        expect(cache.readItem({ collection: independentCollection, key: 1 })).toBeUndefined()

        vi.advanceTimersByTime(10)

        expect(cache.readItem({ collection: independentCollection, key: 1 })).toEqual({ id: 1, name: 'Later queued write' })
      }
      finally {
        stopParent()
        stopRelated()
        stopOther()
      }
    }
    finally {
      vi.useRealTimers()
    }
  })
})
