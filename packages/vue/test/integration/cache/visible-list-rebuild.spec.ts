import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'
import { computed, effectScope } from 'vue'

/** Store with one plain collection filled with ids `1..count`. */
async function createFilledStore(count: number, getKey?: (item: any) => string | number) {
  const store = await createStore({ schema: [{ name: 'items', getKey }], plugins: [] }) as any
  const collection = store.$collections[0]!
  store.$cache.writeItems({ collection, items: Array.from({ length: count }, (_, i) => ({ key: i + 1, value: { id: i + 1 } })) })
  return { store, cache: store.$cache, collection }
}

/** Uncached reference read: a filter bypasses the visible-list cache. */
function freshScan(cache: any, collection: any): any[] {
  return cache.readItems({ collection, filter: () => true })
}

describe('visible list rebuild', () => {
  it('does not serve a stale list after its last scoped reader stopped', async () => {
    const { cache, collection } = await createFilledStore(3)
    const first = effectScope()
    first.run(() => expect(cache.readItems({ collection })).toHaveLength(3))
    first.stop()

    cache.writeItem({ collection, key: 4, item: { id: 4 } })
    cache.deleteItem({ collection, key: 1 })

    const second = effectScope()
    second.run(() => expect(cache.readItems({ collection }).map((item: any) => item.id)).toEqual([2, 3, 4]))
    second.stop()
  })

  it('matches an uncached scan, wrapper for wrapper, through membership changes', async () => {
    const { cache, collection } = await createFilledStore(20)
    const scope = effectScope()
    const list = scope.run(() => computed(() => cache.readItems({ collection })))!
    const check = () => {
      const fresh = freshScan(cache, collection)
      expect(list.value.map((item: any) => item.id)).toEqual(fresh.map((item: any) => item.id))
      list.value.forEach((item: any, index: number) => expect(item).toBe(fresh[index]))
    }
    check()

    cache.writeItem({ collection, key: 21, item: { id: 21 } })
    check()
    cache.deleteItem({ collection, key: 5 })
    cache.deleteItem({ collection, key: 12 })
    check()
    // Delete and rewrite in one publication: the row moves to the end.
    cache.pause()
    cache.deleteItem({ collection, key: 3 })
    cache.writeItem({ collection, key: 3, item: { id: 3, label: 'back' } })
    cache.resume()
    check()
    expect(list.value.at(-1).label).toBe('back')
    cache.writeItems({ collection, items: [30, 31, 32].map(id => ({ key: id, value: { id } })) })
    check()
    cache.addLayer({ id: 'draft', collectionName: 'items', state: { 7: { id: 7, label: 'draft' }, 40: { id: 40 } }, deletedItems: new Set([8]) })
    check()
    cache.removeLayer('draft')
    check()
    scope.stop()
  })

  it('keeps unchanged wrappers when one row is added or removed', async () => {
    const { cache, collection } = await createFilledStore(50)
    const scope = effectScope()
    const list = scope.run(() => computed(() => cache.readItems({ collection })))!
    const before = list.value.slice()

    cache.writeItem({ collection, key: 51, item: { id: 51 } })
    cache.deleteItem({ collection, key: 10 })
    const after = list.value
    expect(after).toHaveLength(50)
    expect(after.filter((item: any) => before.includes(item))).toHaveLength(49)
    expect(after.at(-1)).toBe(cache.readItem({ collection, key: 51 }))
    scope.stop()
  })

  it('rebuilds rows whose public key form changed', async () => {
    const { cache, collection } = await createFilledStore(3, item => item.id)
    const scope = effectScope()
    const list = scope.run(() => computed(() => cache.readItems({ collection })))!
    expect(list.value).toHaveLength(3)

    cache.deleteItem({ collection, key: 2 })
    cache.writeItem({ collection, key: '2', item: { id: '2' } })
    const fresh = freshScan(cache, collection)
    expect(list.value.map((item: any) => item.id)).toEqual(fresh.map((item: any) => item.id))
    list.value.forEach((item: any, index: number) => expect(item).toBe(fresh[index]))
    scope.stop()
  })
})
