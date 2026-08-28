import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache writeItems', () => {
  it('drains a paused later write before surfacing final publication failure', async () => {
    const store = await createStore({
      schema: [
        { name: 'BatchCollection' },
        { name: 'LaterCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const batchCollection = store.$collections[0]!
    const laterCollection = store.$collections[1]!
    const observedLengths: number[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let throwOnPublication = true
    const stop = watchSyncEffect(() => {
      const length = cache.readItems({ collection: batchCollection }).length
      observedLengths.push(length)
      if (length > 0 && throwOnPublication) {
        throwOnPublication = false
        throw new Error('final publication failed')
      }
    })

    try {
      cache.pause()
      cache.writeItems({
        collection: batchCollection,
        items: [
          { key: 1, value: { id: 1 } },
          { key: 2, value: { id: 2 } },
        ],
      })
      cache.writeItem({ collection: laterCollection, key: 1, item: { id: 1, name: 'Later' } })

      expect(() => cache.resume()).toThrow('final publication failed')

      expect(observedLengths).toEqual([0, 2])
      expect(cache.readItem({ collection: laterCollection, key: 1 })).toEqual({ id: 1, name: 'Later' })

      cache.writeItem({ collection: laterCollection, key: 2, item: { id: 2, name: 'Still progresses' } })
      expect(cache.readItem({ collection: laterCollection, key: 2 })).toEqual({ id: 2, name: 'Still progresses' })
    }
    finally {
      stop()
      warn.mockRestore()
    }
  })

  it('runs a throwing outer hook once without replaying or stalling the queue', async () => {
    const store = await createStore({
      schema: [
        { name: 'BatchCollection' },
        { name: 'LaterCollection' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const batchCollection = store.$collections[0]!
    const laterCollection = store.$collections[1]!
    let outerHookCalls = 0
    store.$hooks.hook('afterCacheWrite', ({ collection, result }) => {
      if (collection.name === batchCollection.name && Array.isArray(result) && result.length === 2) {
        outerHookCalls++
        throw new Error('outer hook failed')
      }
    })

    cache.pause()
    cache.writeItems({
      collection: batchCollection,
      items: [
        { key: 1, value: { id: 1 } },
        { key: 2, value: { id: 2 } },
      ],
    })
    cache.writeItem({ collection: laterCollection, key: 1, item: { id: 1, name: 'Already queued' } })

    expect(() => cache.resume()).toThrow('outer hook failed')

    expect(outerHookCalls).toBe(1)
    expect(cache.readItem({ collection: laterCollection, key: 1 })).toEqual({ id: 1, name: 'Already queued' })

    cache.writeItem({ collection: laterCollection, key: 2, item: { id: 2, name: 'Still progresses' } })
    expect(cache.readItem({ collection: laterCollection, key: 2 })).toEqual({ id: 2, name: 'Still progresses' })
    expect(outerHookCalls).toBe(1)
  })
})
