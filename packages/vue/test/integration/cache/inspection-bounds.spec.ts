import { createCoreStore } from '#test-utils/store/realCacheStore'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../../../../devtools/src'
import { validateReadResult } from '../../../../devtools/src/protocol'

// Real cache and neutral runtime, no doubles. Transparent address getters observe
// actual value reads: eager overlay materialization touches rows past scan cap.
describe('bounded effective cache inspection', () => {
  it('retains visible order, overlay precedence, and final canonical deletions', async () => {
    const { store, cache, dispose } = await createCoreStore({ schema: [{ name: 'items' }], syncImmediately: false, tombstoneGc: false })
    onTestFinished(dispose)
    const collection = store.$collections[0]!
    cache.writeItems({ collection, items: [
      { key: 2, value: { id: 2, name: 'base', retained: true } },
      { key: 10, value: { id: 10, name: 'deleted' } },
      { key: 'b', value: { id: 'b', name: 'base-b' } },
      { key: 'a', value: { id: 'a', name: 'base-a' } },
    ] })
    cache.addLayer({ id: 'first', collectionName: 'items', state: { 1: { id: 1, name: 'deleted-new' }, 2: { name: 'first' }, c: { id: 'c', name: 'new-c' } }, deletedItems: new Set(['1', 10]) })
    cache.addLayer({ id: 'second', collectionName: 'items', state: { 0: { id: 0, name: 'new-zero' }, 1: { name: 'still-deleted' }, 2: { name: 'final' }, a: { name: 'final-a' } }, deletedItems: new Set() })
    cache.addLayer({ id: 'skipped', collectionName: 'items', skip: true, state: { 3: { id: 3, name: 'hidden' }, 2: { name: 'hidden-change' } }, deletedItems: new Set(['b']) })
    const view = cache.inspect!().collections[0]!
    expect(view.effectiveCount).toBe(5)
    const rows = Array.from(view.effectiveRows())
    // Visible order is base write order, then rows first added by each layer.
    const visible = [[2, 'final'], ['b', 'base-b'], ['a', 'final-a'], ['c', 'new-c'], [0, 'new-zero']]
    expect(rows.map(row => [row.key, (row.value as any).name])).toEqual(visible)
    expect(rows[0]!.value).toMatchObject({ id: 2, retained: true })
    expect(cache.readItems({ collection }).map(row => [row.id, row.name])).toEqual(visible)
  })

  it('keeps enumerable overlay fields when frozen base contains hidden property of same name', async () => {
    const { store, cache, dispose } = await createCoreStore({ schema: [{ name: 'items' }], syncImmediately: false, tombstoneGc: false })
    onTestFinished(dispose)
    const collection = store.$collections[0]!
    const item = Object.freeze(Object.defineProperty({ id: 'one' }, 'title', { value: 'hidden', enumerable: false }))
    cache.writeItem({ collection, key: 'one', item })
    cache.addLayer({ id: 'overlay', collectionName: 'items', state: { one: { title: 'visible' } }, deletedItems: new Set() })
    expect(cache.readItem({ collection, key: 'one' })).toMatchObject({ id: 'one', title: 'visible' })
    expect(Array.from(cache.inspect!().collections[0]!.effectiveRows())).toMatchObject([{ key: 'one', value: { id: 'one', title: 'visible' } }])
  })

  // Public cache writes retain frozen accessors. Real inspection must not execute
  // them, must bound descriptor work, and must disclose omitted diagnostic fields.
  it('bounds merged descriptors without invoking getters and resolves overrides beyond base cap', async () => {
    const { store, cache, dispose } = await createCoreStore({ schema: [{ name: 'items' }], syncImmediately: false, tombstoneGc: false })
    onTestFinished(dispose)
    let getters = 0
    let descriptors = 0
    const item = { id: 'one', name: 'base' }
    for (let index = 0; index < 10_001; index++) {
      Object.defineProperty(item, `field${index}`, { enumerable: true, get() {
        getters++
        return 'unsafe'
      } })
    }
    const observed = new Proxy(Object.freeze(item), {
      getOwnPropertyDescriptor(source, key) {
        descriptors++
        return Reflect.getOwnPropertyDescriptor(source, key)
      },
    })
    cache.writeItem({ collection: store.$collections[0]!, key: 'one', item: observed })
    cache.addLayer({ id: 'overlay', collectionName: 'items', state: { one: { name: 'pending', field0: 'safe override' } }, deletedItems: new Set() })
    // Ordinary layer resolution reads values; only inspection is measured.
    getters = 0
    descriptors = 0
    const rows = Array.from(cache.inspect!().collections[0]!.effectiveRows())
    expect(getters, 'inspection must preserve accessor descriptors').toBe(0)
    expect(descriptors, 'merged diagnostic values must bound reflected fields').toBeLessThan(4000)
    expect(rows[0]).toMatchObject({ key: 'one', truncated: true, value: { name: 'pending', field0: 'safe override' } })
    expect(Object.hasOwn(rows[0]!.value as object, 'field10000')).toBe(false)
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(store, { id: 'bounded-fields' })
    const reply = validateReadResult('rstore:get-cache', runtime.read({ method: 'rstore:get-cache', target, collection: 'items', page: { limit: 1 } }), target)
    expect(reply.truncated).toBe(true)
    expect(reply.data?.rows[0]?.value).toMatchObject({ kind: 'object', entries: expect.arrayContaining([
      ['name', 'pending'],
      ['field0', 'safe override'],
      ['field1', expect.objectContaining({ kind: 'accessor', reason: 'getter not invoked' })],
    ]) })
    expect(getters).toBe(0)
  })

  it('counts without reading values and merges only consumed effective rows', async () => {
    const { store, cache, dispose } = await createCoreStore({ schema: [{ name: 'items' }], syncImmediately: false, tombstoneGc: false })
    onTestFinished(dispose)
    const collection = store.$collections[0]!
    // Frozen rows are stored as-is, so transparent proxies observe value reads.
    const touched = new Set<number>()
    const row = (key: number) => new Proxy(Object.freeze({ id: key, name: `base-${key}` }), {
      get(target, property, receiver) {
        touched.add(key)
        return Reflect.get(target, property, receiver)
      },
      getOwnPropertyDescriptor(target, property) {
        touched.add(key)
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    cache.writeItems({ collection, items: Array.from({ length: 10_001 }, (_, key) => ({ key, value: row(key) })) })
    cache.addLayer({ id: 'overlay', collectionName: 'items', state: { 0: { name: 'pending' } }, deletedItems: new Set() })
    touched.clear()
    const view = cache.inspect!().collections[0]!
    expect(view.effectiveCount).toBe(10_001)
    expect(touched.size, 'counting must inspect membership without materializing values').toBe(0)
    const iterator = view.effectiveRows()[Symbol.iterator]()
    expect(iterator.next().value).toMatchObject({ key: 0, value: { id: 0, name: 'pending' } })
    iterator.return?.()
    expect(touched.size, 'one consumed row must not read remaining committed values').toBe(1)

    touched.clear()
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(store, { id: 'bounded' })
    const reply = validateReadResult('rstore:get-cache', runtime.read({ method: 'rstore:get-cache', target, collection: 'items', page: { limit: 1 } }), target)
    if (!reply.data)
      throw new Error('Expected cache inspection page')
    expect(reply.data).toMatchObject({ total: 10_001, matchingTotal: null, scanTruncated: true })
    expect(reply.data.rows.map(row => row.key)).toEqual([0])
    expect(reply.data.rows[0]!.value).toMatchObject({ kind: 'object', entries: expect.arrayContaining([['id', 0], ['name', 'pending']]) })
    expect(touched.size, 'neutral scan cap must include cache-owned overlay resolution').toBe(10_000)
  })
})
