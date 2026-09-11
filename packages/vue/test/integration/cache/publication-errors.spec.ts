import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache writeItems', () => {
  it('publishes valid relation children committed before a direct write fails', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'ParentCollection',
          relations: {
            validChild: { to: { ChildCollection: { on: { id: 'validChildId' } } }, many: false },
            invalidChild: { to: { ChildCollection: { on: { id: 'invalidChildId' } } }, many: false },
          },
        },
        { name: 'ChildCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const parentCollection = store.$collections[0]!
    const childCollection = store.$collections[1]!
    const observedChildLengths: number[] = []
    const childHookKeys: Array<string | number> = []
    const stop = watchSyncEffect(() => {
      observedChildLengths.push(cache.readItems({ collection: childCollection }).length)
    })
    store.$hooks.hook('afterCacheWrite', ({ collection, key }) => {
      if (collection.name === childCollection.name && key !== undefined)
        childHookKeys.push(key)
    })

    try {
      expect(() => cache.writeItem({
        collection: parentCollection,
        key: 1,
        item: {
          id: 1,
          validChildId: 11,
          validChild: { id: 11, name: 'Committed child' },
          invalidChildId: 12,
          invalidChild: [{ id: 12, name: 'Invalid to-one child' }],
        },
      })).toThrow('Expected object for relation ParentCollection.invalidChild')

      expect(cache.readItem({ collection: childCollection, key: 11 }))
        .toEqual({ id: 11, name: 'Committed child' })
      expect(cache.readItem({ collection: parentCollection, key: 1 })).toBeUndefined()
      expect(observedChildLengths).toEqual([0, 1])
      expect(childHookKeys).toEqual([11])
    }
    finally {
      stop()
    }
  })

  it('publishes queued relation progress and continues with later writes', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'ParentCollection',
          relations: {
            validChild: { to: { ChildCollection: { on: { id: 'validChildId' } } }, many: false },
            invalidChild: { to: { ChildCollection: { on: { id: 'invalidChildId' } } }, many: false },
          },
        },
        { name: 'ChildCollection' },
        { name: 'IndependentCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const parentCollection = store.$collections[0]!
    const childCollection = store.$collections[1]!
    const independentCollection = store.$collections[2]!
    const observedChildLengths: number[] = []
    const stop = watchSyncEffect(() => {
      observedChildLengths.push(cache.readItems({ collection: childCollection }).length)
    })

    try {
      cache.pause()
      cache.writeItem({
        collection: parentCollection,
        key: 1,
        item: {
          id: 1,
          validChildId: 11,
          validChild: { id: 11, name: 'Committed child' },
          invalidChildId: 12,
          invalidChild: [{ id: 12, name: 'Invalid to-one child' }],
        },
      })
      cache.writeItem({
        collection: independentCollection,
        key: 1,
        item: { id: 1, name: 'Later queued write' },
      })

      expect(() => cache.resume()).toThrow('Expected object for relation ParentCollection.invalidChild')
      expect(cache.readItem({ collection: childCollection, key: 11 }))
        .toEqual({ id: 11, name: 'Committed child' })
      expect(cache.readItem({ collection: parentCollection, key: 1 })).toBeUndefined()
      expect(cache.readItem({ collection: independentCollection, key: 1 }))
        .toEqual({ id: 1, name: 'Later queued write' })
      expect(observedChildLengths).toEqual([0, 1])
    }
    finally {
      stop()
    }
  })

  it('publishes partial state and preserves write and settlement errors', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'TestCollection',
          relations: {
            related: { to: { RelatedCollection: { on: { id: 'relatedId' } } }, many: false },
          },
        },
        { name: 'RelatedCollection' },
        { name: 'IndependentCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const independentCollection = store.$collections[2]!
    const items: Array<{ key: number, value: any }> = [
      { key: 1, value: { id: 1, name: 'Written before failure' } },
      {
        key: 2,
        value: {
          id: 2,
          relatedId: 11,
          related: [{ id: 11, name: 'Invalid to-one relation value' }],
        },
      },
    ]
    const observedLengths: number[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let throwOnPublication = true
    const stop = watchSyncEffect(() => {
      const length = cache.readItems({ collection }).length
      observedLengths.push(length)
      if (length > 0 && throwOnPublication) {
        throwOnPublication = false
        throw new Error('reader failed during partial publication')
      }
    })

    try {
      let caught: unknown
      try {
        cache.writeItems({ collection, items })
      }
      catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(AggregateError)
      const aggregate = caught as AggregateError
      expect(aggregate.errors.map(error => (error as Error).message)).toEqual([
        'Expected object for relation TestCollection.related',
        'reader failed during partial publication',
      ])
      expect((aggregate.cause as Error).message).toBe('Expected object for relation TestCollection.related')
      expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Written before failure' })
      expect(observedLengths).toEqual([0, 1])

      items[1]!.value.related = { id: 11, name: 'Valid on retry' }
      cache.writeItem({
        collection: independentCollection,
        key: 1,
        item: { id: 1, name: 'Later queued write' },
      })

      expect(cache.readItem({ collection, key: 2 })).toMatchObject({ id: 2, relatedId: 11 })
      expect(cache.readItem({ collection: independentCollection, key: 1 })).toEqual({ id: 1, name: 'Later queued write' })
      expect(observedLengths).toEqual([0, 1, 2])
    }
    finally {
      stop()
      warn.mockRestore()
    }
  })

  it('does not emit the outer hook on partial failure and emits it once after retry publication', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'TestCollection',
          relations: {
            related: { to: { RelatedCollection: { on: { id: 'relatedId' } } }, many: false },
          },
        },
        { name: 'RelatedCollection' },
        { name: 'IndependentCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const relatedCollection = store.$collections[1]!
    const independentCollection = store.$collections[2]!
    const items: Array<{ key: number, value: any }> = [
      { key: 1, value: { id: 1, name: 'Written before failure' } },
      {
        key: 2,
        value: {
          id: 2,
          relatedId: 11,
          related: [{ id: 11, name: 'Invalid to-one relation value' }],
        },
      },
    ]
    const observedLengths: number[] = []
    const observedRelatedLengths: number[] = []
    const outerHookLengths: number[] = []
    const stop = watchSyncEffect(() => {
      observedLengths.push(cache.readItems({ collection }).length)
    })
    const stopRelated = watchSyncEffect(() => {
      observedRelatedLengths.push(cache.readItems({ collection: relatedCollection }).length)
    })
    store.$hooks.hook('afterCacheWrite', ({ collection: hookCollection, result }) => {
      if (hookCollection.name === collection.name && Array.isArray(result) && result.length === items.length) {
        outerHookLengths.push(observedLengths.at(-1)!)
      }
    })

    try {
      expect(() => cache.writeItems({ collection, items }))
        .toThrow('Expected object for relation TestCollection.related')

      expect(observedLengths).toEqual([0, 1])
      expect(observedRelatedLengths).toEqual([0])
      expect(outerHookLengths).toEqual([])

      items[1]!.value.related = { id: 11, name: 'Valid on retry' }
      cache.writeItem({
        collection: independentCollection,
        key: 1,
        item: { id: 1, name: 'Later queued write' },
      })

      const retriedItem = cache.readItem({ collection, key: 2 }) as any
      expect(retriedItem).toMatchObject({ id: 2, relatedId: 11 })
      expect(retriedItem.related).toMatchObject({ id: 11, name: 'Valid on retry' })
      expect(cache.readItem({ collection: independentCollection, key: 1 })).toEqual({ id: 1, name: 'Later queued write' })
      expect(observedLengths).toEqual([0, 1, 2])
      expect(observedRelatedLengths).toEqual([0, 1])
      expect(outerHookLengths).toEqual([2])
    }
    finally {
      stop()
      stopRelated()
    }
  })
})
