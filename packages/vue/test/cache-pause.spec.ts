import { describe, expect, it } from 'vitest'
import { effectScope, watchSyncEffect } from 'vue'
import { createStore } from '../src'

describe('cache pause depth', () => {
  it('flushes queued writes and reactive list consumers after final resume', async () => {
    const store = await createStore({
      schema: [{ name: 'Todo' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const lengths: number[] = []
    const scope = effectScope()

    scope.run(() => watchSyncEffect(() => {
      lengths.push(cache.readItems({ collection }).length)
    }))

    cache.pause()
    cache.pause()
    cache.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1, label: 'First' } },
        { key: 2, value: { id: 2, label: 'Second' } },
      ],
    })

    expect(cache.readItems({ collection })).toHaveLength(0)
    expect(lengths).toEqual([0])

    cache.resume()
    expect(cache.readItems({ collection })).toHaveLength(0)
    expect(lengths).toEqual([0])

    cache.resume()
    expect(cache.readItems({ collection })).toHaveLength(2)
    expect(lengths.at(-1)).toBe(2)

    scope.stop()
    cache.dispose()
  })
})
