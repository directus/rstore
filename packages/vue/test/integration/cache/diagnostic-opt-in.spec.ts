import { createCoreStore } from '#test-utils/store/realCacheStore'
import { describe, expect, it, onTestFinished } from 'vitest'

/** Exercise actual cache entry points without a backend or diagnostic adapter. */
async function fixture() {
  const value = await createCoreStore({ schema: [{ name: 'items' }], syncImmediately: false, tombstoneGc: false })
  onTestFinished(value.dispose)
  return { ...value, collection: value.store.$collections[0]! }
}

// Legacy cache calls return undefined, including paused writes. Receipts are an
// explicit diagnostic capability; checking enqueue status must not alter order.
describe('cache diagnostics opt-in', () => {
  it('preserves void results and queued publication on ordinary cache methods', async () => {
    const { cache, collection } = await fixture()
    expect(cache.writeItem({ collection, key: 1, item: { id: 1, name: 'first' } })).toBeUndefined()
    expect(cache.deleteItem({ collection, key: 1 })).toBeUndefined()
    expect(cache.readItem({ collection, key: 1 })).toBeUndefined()
    cache.pause()
    expect(cache.writeItem({ collection, key: 2, item: { id: 2, name: 'queued' } })).toBeUndefined()
    expect(cache.deleteItem({ collection, key: 2 })).toBeUndefined()
    expect(cache.clear()).toBeUndefined()
    expect(cache.writeItem({ collection, key: 3, item: { id: 3, name: 'survivor' } })).toBeUndefined()
    expect(cache.readItems({ collection })).toEqual([])
    cache.resume()
    expect(cache.readItems({ collection })).toEqual([{ id: 3, name: 'survivor' }])
    expect(cache.clear()).toBeUndefined()
    expect(cache.readItems({ collection })).toEqual([])
  })

  it('reports only the requested operation completion across pause and reentrant writes', async () => {
    const { cache, collection, store } = await fixture()
    const receipts = cache.receipts!
    expect(receipts.writeItem({ collection, key: 1, item: { id: 1 } })).toEqual({ status: 'completed' })
    cache.pause()
    expect(receipts.deleteItem({ collection, key: 1 })).toEqual({ status: 'queued' })
    expect(receipts.clear()).toEqual({ status: 'queued' })
    expect(receipts.writeItem({ collection, key: 2, item: { id: 2 } })).toEqual({ status: 'queued' })
    let nestedStatus: unknown
    store.$hooks.hook('afterCacheWrite', ({ key }) => {
      if (key === 2) {
        nestedStatus = receipts.writeItem({ collection, key: 3, item: { id: 3 } })
      }
    })
    cache.resume()
    expect(nestedStatus).toEqual({ status: 'queued' })
    expect(cache.readItems({ collection })).toEqual([{ id: 2 }, { id: 3 }])
    expect(receipts.deleteItem({ collection, key: 2 })).toEqual({ status: 'completed' })
    expect(receipts.clear()).toEqual({ status: 'completed' })
    expect(cache.readItems({ collection })).toEqual([])
  })

  it('does not inspect diagnostic identity during hydration before inspection is requested', async () => {
    const { cache, collection } = await fixture()
    const reflected: PropertyKey[] = []
    // A supported frozen row keeps its original object. Reflection is observable
    // application work and must not be added by inactive diagnostic bookkeeping.
    const row = new Proxy(Object.freeze({ id: 7, name: 'hydrated' }), {
      getOwnPropertyDescriptor(target, property) {
        reflected.push(property)
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    cache.setState({ collections: { items: { 7: row } }, markers: {}, modules: {}, queryMeta: {} })
    expect(reflected).not.toContain('$overrideKey')
    expect(cache.readItem({ collection, key: 7 })?.name).toBe('hydrated')
    const view = cache.inspect!().collections[0]!
    expect(Array.from(view.rows(), row => row.key)).toEqual([7])
    cache.writeItem({ collection, key: 8, item: { id: 'different', name: 'override' } })
    expect(Array.from(view.rows(), row => row.key)).toEqual([7, 8])
  })
})
