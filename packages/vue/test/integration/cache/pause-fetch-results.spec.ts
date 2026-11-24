import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'

// Hydration pauses the cache while queries load. Fetched results must follow
// the same queue as direct writes and only become readable on resume.

/** Store with a `todos` collection backed by the fake remote. */
function setup(batch: boolean) {
  return createVueStack({
    schema: [{ name: 'todos' }],
    data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
    batch,
    batching: { fetch: batch, mutations: false },
  })
}

describe('cache pause with fetched results', () => {
  for (const batch of [false, true]) {
    it(`queues a findFirst result until resume (batch: ${batch})`, async () => {
      const { store, cache } = await setup(batch)
      const collection = store.$collections[0]
      cache.pause()
      const result = await store.todos.findFirst('1')
      expect(result?.title).toBe('One')
      expect(cache.readItem({ collection, key: '1' })).toBeUndefined()
      // A consumer that read the wrapper while paused keeps following the row.
      const title = computed(() => result?.title)
      expect(title.value).toBe('One')
      cache.resume()
      expect(cache.readItem({ collection, key: '1' })?.title).toBe('One')
      cache.writeItem({ collection, key: '1', item: { id: '1', title: 'Renamed' } })
      expect(title.value).toBe('Renamed')
    })
  }

  it('queues findMany results until resume', async () => {
    const { store, cache } = await setup(false)
    const collection = store.$collections[0]
    cache.pause()
    const result = await store.todos.findMany()
    expect(result).toHaveLength(2)
    expect(cache.readItems({ collection })).toHaveLength(0)
    cache.resume()
    expect(cache.readItems({ collection })).toHaveLength(2)
  })
})
