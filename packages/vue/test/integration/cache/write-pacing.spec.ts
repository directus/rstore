import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'

describe('cache', () => {
  it('should stagger sequential writeItem calls in the same 10ms window', async () => {
    vi.useFakeTimers()

    try {
      const store = await createStore({
        schema: [{ name: 'TestCollection' }],
        plugins: [],
        cacheStaggering: 1,
      })
      const cache = store.$cache
      const collection = store.$collections[0]!

      cache.writeItem({ collection, key: 1, item: { id: 1, name: 'Item 1' } })
      cache.writeItem({ collection, key: 2, item: { id: 2, name: 'Item 2' } })

      expect(cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Item 1' })
      expect(cache.readItem({ collection, key: 2 })).toBeUndefined()

      vi.advanceTimersByTime(10)

      expect(cache.readItem({ collection, key: 2 })).toEqual({ id: 2, name: 'Item 2' })
    }
    finally {
      vi.useRealTimers()
    }
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
})
