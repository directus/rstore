import { stringifyHLC } from '@rstore/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../src'

/** Encode a deterministic HLC timestamp for cache wiring tests. */
function hlc(physical: number): string {
  return stringifyHLC({ physical, logical: 0, nodeId: 'test' })
}

/** Create a cache with timers off unless a lifecycle case overrides them. */
async function createTestStore(options: Record<string, any> = {}) {
  return createStore({
    schema: [{ name: 'TestCollection' }],
    plugins: [],
    tombstoneGc: false,
    ...options,
  })
}

afterEach(() => vi.useRealTimers())

describe('vue tombstone lifecycle', () => {
  it('records causal deletes and ignores legacy deletes without a timestamp', async () => {
    const store = await createTestStore()
    const collection = store.$collections[0]!
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'before' } })
    store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(200) })
    store.$cache.deleteItem({ collection, key: 2 })

    expect(store.$cache.tombstones.get('TestCollection', 1)?.deletedAt).toBe(hlc(200))
    expect(store.$cache.tombstones.get('TestCollection', 2)).toBeUndefined()
  })

  it('wires losing writes, winning writes, and explicit resurrection into Core', async () => {
    const store = await createTestStore()
    const collection = store.$collections[0]!
    store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(500) })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'ghost' }, fieldTimestamps: { name: hlc(200) } })
    expect(store.$cache.readItem({ collection, key: 1 })).toBeUndefined()

    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'reborn' }, fieldTimestamps: { name: hlc(600) } })
    expect(store.$cache.readItem({ collection, key: 1 })?.name).toBe('reborn')
    expect(store.$cache.tombstones.get('TestCollection', 1)).toBeUndefined()

    store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(700) })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'explicit' } })
    expect(store.$cache.readItem({ collection, key: 1 })?.name).toBe('explicit')
  })

  it('keeps clear boundaries for all collections and one collection', async () => {
    const store = await createTestStore({ schema: [{ name: 'A' }, { name: 'B' }] })
    const [a, b] = store.$collections
    store.$cache.deleteItem({ collection: a!, key: 1, deletedAt: hlc(100) })
    store.$cache.deleteItem({ collection: b!, key: 2, deletedAt: hlc(100) })
    store.$cache.clearCollection({ collection: a! })
    expect(store.$cache.tombstones.get('A', 1)).toBeUndefined()
    expect(store.$cache.tombstones.get('B', 2)).toBeDefined()

    store.$cache.clear()
    expect(store.$cache.tombstones.size()).toBe(0)
  })

  it('uses default client timer settings', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(24 * 60 * 60 * 1000 + 10))
    const store = await createTestStore({ tombstoneGc: undefined })
    const collection = store.$collections[0]!
    store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(1) })

    await vi.advanceTimersByTimeAsync(60_000)
    expect(store.$cache.tombstones.get('TestCollection', 1)).toBeUndefined()
    store.$cache.dispose()
  })

  it('forwards custom timer settings and installs no timer when disabled or server-side', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(10_000))
    const custom = await createTestStore({ tombstoneGc: { intervalMs: 100, ttlMs: 500 } })
    const customCollection = custom.$collections[0]!
    custom.$cache.deleteItem({ collection: customCollection, key: 1, deletedAt: hlc(1) })
    await vi.advanceTimersByTimeAsync(100)
    expect(custom.$cache.tombstones.get('TestCollection', 1)).toBeUndefined()
    custom.$cache.dispose()

    const disabled = await createTestStore({ tombstoneGc: false })
    disabled.$cache.deleteItem({ collection: disabled.$collections[0]!, key: 1, deletedAt: hlc(1) })
    const server = await createTestStore({ isServer: true, tombstoneGc: { intervalMs: 100, ttlMs: 500 } })
    server.$cache.deleteItem({ collection: server.$collections[0]!, key: 1, deletedAt: hlc(1) })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(disabled.$cache.tombstones.get('TestCollection', 1)).toBeDefined()
    expect(server.$cache.tombstones.get('TestCollection', 1)).toBeDefined()
  })

  it('stops the timer idempotently and never lets item eviction touch tombstones', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(10_000))
    const store = await createTestStore({ tombstoneGc: { intervalMs: 100, ttlMs: 500 } })
    const collection = store.$collections[0]!
    store.$cache.deleteItem({ collection, key: 2, deletedAt: hlc(1) })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1 } })
    const item = store.$cache.readItem({ collection, key: 1 })!
    store.$cache.garbageCollectItem({ collection, item })
    expect(store.$cache.tombstones.get('TestCollection', 2)).toBeDefined()

    store.$cache.dispose()
    store.$cache.dispose()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(store.$cache.tombstones.get('TestCollection', 2)).toBeDefined()
  })
})
