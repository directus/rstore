import { createCoreStore } from '#test-utils/store/realCacheStore'
import { waitForTombstoneSweeps } from '#test-utils/tombstoneSweeps'
import { describe, expect, it, onTestFinished } from 'vitest'
import { computed, reactive } from 'vue'

/** Real factory and real cache; no instrumentation/cache doubles. */
async function createFixture(options: Parameters<typeof createCoreStore>[0] = { schema: [{ name: 'items' }] }) {
  const fixture = await createCoreStore({ syncImmediately: false, tombstoneGc: false, ...options })
  onTestFinished(fixture.dispose)
  return fixture
}

// Contract: reads retain public keys, separate base/overlay state, and cause no hooks.
// Defect: reading wrapped items or coercing every address to string loses identity.
describe('public cache inspection', () => {
  it('preserves key form and reports writes, deletes, and resets without hooks', async () => {
    const { store, cache } = await createFixture()
    const collection = store.$collections[0]!
    for (const key of [0, '', '01', 2]) {
      cache.writeItem({ collection, key, item: { id: key, name: String(key) }, marker: 'loaded' })
    }
    // Cache address wins when item identity differs, including override addresses.
    cache.writeItem({ collection, key: 'override', item: { id: 'different', $overrideKey: 'override' } })
    const events: string[] = []
    store.$hooks.hook('afterCacheWrite', () => {
      events.push('write')
    })
    store.$hooks.hook('afterCacheReset', () => {
      events.push('reset')
    })
    const view = cache.inspect!().collections[0]!
    expect(view.name).toBe('items')
    expect(view.count).toBe(5)
    expect(Array.from(view.rows(), row => row.key)).toEqual([0, 2, '', '01', 'override'])
    expect(view.effectiveCount).toBe(5)
    expect(Array.from(view.effectiveRows(), row => row.key)).toEqual([0, 2, '', '01', 'override'])
    expect(cache.inspect!().metadata()).toMatchObject({ markers: { loaded: true } })
    expect(events).toEqual([])

    cache.deleteItem({ collection, key: 2 })
    expect(view.count).toBe(4)
    expect(Array.from(view.rows(), row => row.key)).toEqual([0, '', '01', 'override'])
    cache.clear()
    expect(view.count).toBe(0)
    expect(Array.from(view.rows())).toEqual([])
  })

  it('keeps layers separate and delegates visible state resolution to cache', async () => {
    const { store, cache } = await createFixture()
    const collection = store.$collections[0]!
    cache.writeItems({ collection, items: [
      { key: 1, value: { id: 1, name: 'base' } },
      { key: 2, value: { id: 2, name: 'deleted' } },
    ] })
    cache.addLayer({ id: 'optimistic', collectionName: 'items', optimistic: true, prevent: { update: true }, state: { 1: { id: 1, name: 'pending' }, 3: { id: 3, name: 'new' } }, deletedItems: new Set([2]) })
    cache.addLayer({ id: 'skipped', collectionName: 'items', skip: true, state: { 4: { id: 4, name: 'hidden' } }, deletedItems: new Set([1]) })
    const inspection = cache.inspect!()
    const view = inspection.collections[0]!
    expect(Array.from(view.rows(), row => [row.key, (row.value as any).name])).toEqual([[1, 'base'], [2, 'deleted']])
    expect(view.effectiveCount).toBe(2)
    expect(Array.from(view.effectiveRows(), row => [row.key, (row.value as any).name])).toEqual([[1, 'pending'], [3, 'new']])
    const layers = Array.from(inspection.layers())
    expect(layers.map(layer => [layer.id, layer.optimistic, layer.skip])).toEqual([['optimistic', true, false], ['skipped', false, true]])
    expect(layers[0]!.prevent).toEqual({ update: true })
    expect(Array.from(layers[0]!.deletedKeys())).toEqual([2])
    expect(Array.from(layers[1]!.rows(), row => row.key)).toEqual([4])
    cache.removeLayer('optimistic')
    expect(Array.from(view.effectiveRows(), row => row.key)).toEqual([1, 2])
    expect(Array.from(inspection.layers(), layer => layer.id)).toEqual(['skipped'])
  })

  it('reports causal/module metadata as borrowed views without changing values', async () => {
    const { store, cache } = await createFixture()
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, name: 'saved' }, fieldTimestamps: { name: 10 } })
    cache.deleteItem({ collection, key: 2, deletedAt: 20 })
    const state = cache.getModuleState<{ name: 'counter', state: { stats: { value: number } } }>('counter', 'one', { stats: { value: 7 } })
    const before = cache.getState()
    const metadata = cache.inspect!().metadata() as any
    expect(metadata.fieldTimestamps.get('items').get(1)).toEqual({ name: 10 })
    expect(Array.from(metadata.tombstones)).toEqual([{ collection: 'items', key: 2, deletedAt: 20 }])
    expect(metadata.modules['counter:one']).toEqual({ stats: { value: 7 } })
    state.stats.value = 8
    expect(metadata.modules['counter:one'].stats.value).toBe(8)
    expect(cache.getState()).toEqual({ ...before, modules: { 'counter:one': { stats: { value: 8 } } } })
  })

  it('refreshes direct and reactive cache readers when public layer skip changes', async () => {
    const { store, cache } = await createFixture()
    const collection = store.$collections[0]!
    const layer = reactive({ id: 'toggle', collectionName: 'items', state: { 1: { id: 1, name: 'visible' } }, deletedItems: new Set<string | number>(), skip: false })
    cache.addLayer(layer)
    const visible = computed(() => cache.readItem({ collection, key: 1 })?.name)
    expect(visible.value).toBe('visible')
    expect(Array.from(cache.inspect!().collections[0]!.effectiveRows(), row => row.key)).toEqual([1])
    cache.getLayer('toggle')!.skip = true
    expect(cache.readItem({ collection, key: 1 })).toBeUndefined()
    expect(visible.value).toBeUndefined()
    expect(Array.from(cache.inspect!().collections[0]!.effectiveRows())).toEqual([])
    cache.getLayer('toggle')!.skip = false
    expect(visible.value).toBe('visible')
    expect(Array.from(cache.inspect!().collections[0]!.effectiveRows(), row => row.key)).toEqual([1])
  })

  it('keeps committed override address types through queues, deletes, and hydration', async () => {
    const { store, cache } = await createFixture()
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 9, item: { id: 'other', $overrideKey: 9, name: 'numeric override' } })
    const rows = () => Array.from(cache.inspect!().collections[0]!.rows(), row => [row.key, (row.value as any).name])
    expect(rows()).toEqual([[9, 'numeric override']])
    cache.pause()
    cache.writeItem({ collection, key: '9', item: { id: 'other', name: 'queued string override' } })
    expect(rows()).toEqual([[9, 'numeric override']])
    cache.resume()
    expect(rows()).toEqual([['9', 'queued string override']])
    cache.deleteItem({ collection, key: '9' })
    cache.writeItem({ collection, key: 9, item: { id: 'other', name: 'new numeric row' } })
    expect(rows()).toEqual([[9, 'new numeric row']])
    cache.setState({ collections: { items: { 9: { id: 'other', name: 'hydrated' } } }, markers: {}, modules: {}, queryMeta: {} })
    // Hydration format predates key breadcrumbs; unavailable original type falls back.
    expect(rows()).toEqual([['9', 'hydrated']])
    cache.clear()
    cache.setState({ collections: { items: { 9: { id: 9, name: 'restored primary key' } } }, markers: {}, modules: {}, queryMeta: {} })
    expect(rows()).toEqual([[9, 'restored primary key']])
  })
})

// Contract: actual disposal emits once and stops collector even when a hook throws.
// Defect: notification before unguarded cleanup leaks timer or repeat-notifies.
describe('cache disposal lifecycle', () => {
  it('emits once, releases timer even on hook failure, and keeps stored values usable', async () => {
    const { store, cache } = await createFixture({ schema: [{ name: 'items' }], tombstoneGc: { intervalMs: 5, ttlMs: 1_000 } })
    const owners: unknown[] = []
    store.$hooks.hook('dispose', ({ store: owner }) => {
      owners.push(owner)
      throw new Error('observer failed')
    })
    const releasedOwners: unknown[] = []
    store.$hooks.hook('dispose', ({ store: owner }) => {
      releasedOwners.push(owner)
    })
    expect(() => cache.dispose()).toThrow('observer failed')
    expect(() => cache.dispose()).not.toThrow()
    expect(owners).toEqual([store])
    expect(releasedOwners, 'earlier observer failure must not suppress later resource release').toHaveLength(1)
    expect(releasedOwners[0]).toBe(store)
    cache.deleteItem({ collection: store.$collections[0]!, key: 2, deletedAt: 1 })
    await waitForTombstoneSweeps(5)
    expect(cache.tombstones.get('items', 2)?.deletedAt).toBe(1)
  })
})

// Contract: direct mode exercises actual Core without Vue collection proxy.
describe('real-cache Core factory mode', () => {
  it('retains Vue default and binds actual Core owner before init', async () => {
    const vue = await createFixture()
    expect((vue.store as any).items.findMany).toBeTypeOf('function')
    let initializedOwner: unknown
    const core = await createFixture({
      schema: [{ name: 'items' }],
      factory: 'core',
      plugins: [{ name: 'capture', setup({ hook }) {
        hook('init', ({ store }) => {
          initializedOwner = store
          store.$cache.writeItem({ collection: store.$collections[0]!, key: 0, item: { id: 0, name: 'during init' } })
        })
      } }],
    })
    expect((core.store as any).items).toBeUndefined()
    expect(initializedOwner).toBe(core.store)
    expect(Array.from(core.cache.inspect!().collections[0]!.rows())).toEqual([{ key: 0, value: { id: 0, name: 'during init' } }])
    expect(core.cache.readItem({ collection: core.store.$collections[0]!, key: 0 })?.name).toBe('during init')
  })
})
