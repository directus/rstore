import { waitForTombstoneSweeps } from '#test-utils/tombstoneSweeps'
import { stringifyHLC } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
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

  it('installs the default 60-second native client interval', async () => {
    // Call-through observer leaves scheduling real while measuring public option wiring.
    const intervals = vi.spyOn(globalThis, 'setInterval')
    let store: Awaited<ReturnType<typeof createTestStore>> | undefined
    try {
      store = await createTestStore({ tombstoneGc: undefined })
      expect(intervals.mock.calls.map(([, delay]) => delay)).toEqual([60_000])
    }
    finally {
      store?.$cache.dispose()
      intervals.mockRestore()
    }
  })

  it('keeps the default 24-hour TTL when only the real sweep interval is shortened', async () => {
    const store = await createTestStore({ tombstoneGc: { intervalMs: 5 } })
    try {
      const collection = store.$collections[0]!
      const now = Date.now()
      const hour = 60 * 60 * 1_000
      store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(now - 25 * hour) })
      store.$cache.deleteItem({ collection, key: 2, deletedAt: hlc(now - hour) })

      await vi.waitFor(() => {
        expect(store.$cache.tombstones.get('TestCollection', 1), 'default TTL must expire 25-hour deletion').toBeUndefined()
      }, { timeout: 1_000, interval: 5 })
      expect(store.$cache.tombstones.get('TestCollection', 2)?.deletedAt, 'default TTL must retain 1-hour deletion').toBe(hlc(now - hour))
      store.$cache.writeItem({ collection, key: 2, item: { id: 2, name: 'stale' }, fieldTimestamps: { name: hlc(now - 2 * hour) } })
      expect(store.$cache.readItem({ collection, key: 2 }), 'retained deletion must reject stale write').toBeUndefined()
      expect(store.$cache.tombstones.get('TestCollection', 2)?.deletedAt, 'stale write must preserve retained deletion').toBe(hlc(now - hour))
    }
    finally {
      store.$cache.dispose()
    }
  })

  it('forwards custom timer settings to real expiration and retention', async () => {
    const store = await createTestStore({ tombstoneGc: { intervalMs: 5, ttlMs: 60_000 } })
    try {
      const collection = store.$collections[0]!
      const now = Date.now()
      store.$cache.deleteItem({ collection, key: 1, deletedAt: hlc(now - 120_000) })
      store.$cache.deleteItem({ collection, key: 2, deletedAt: hlc(now - 1_000) })
      await vi.waitFor(() => {
        expect(store.$cache.tombstones.get('TestCollection', 1), 'custom TTL must expire eligible deletion').toBeUndefined()
      }, { timeout: 1_000, interval: 5 })
      expect(store.$cache.tombstones.get('TestCollection', 2)?.deletedAt).toBe(hlc(now - 1_000))
    }
    finally {
      store.$cache.dispose()
    }
  })

  it.each([
    { name: 'disabled', options: { tombstoneGc: false } },
    { name: 'server-side', options: { isServer: true, tombstoneGc: { intervalMs: 5, ttlMs: 1_000 } } },
  ])('installs no $name collector while real control sweeps complete', async ({ options }) => {
    // Expired under defaults and custom TTL, so accidental scheduling cannot hide behind retention.
    const intervals = vi.spyOn(globalThis, 'setInterval')
    let store: Awaited<ReturnType<typeof createTestStore>> | undefined
    try {
      store = await createTestStore(options)
      expect(intervals.mock.calls, 'disabled/server store must install no interval').toEqual([])
      intervals.mockRestore()
      store.$cache.deleteItem({ collection: store.$collections[0]!, key: 1, deletedAt: hlc(1) })
      await waitForTombstoneSweeps(5)
      expect(store.$cache.tombstones.get('TestCollection', 1)?.deletedAt).toBe(hlc(1))
    }
    finally {
      store?.$cache.dispose()
      intervals.mockRestore()
    }
  })

  it('stops an active timer idempotently and never lets item eviction touch tombstones', async () => {
    const store = await createTestStore({ tombstoneGc: { intervalMs: 5, ttlMs: 500 } })
    try {
      const collection = store.$collections[0]!
      store.$cache.deleteItem({ collection, key: 3, deletedAt: hlc(1) })
      await vi.waitFor(() => {
        expect(store.$cache.tombstones.get('TestCollection', 3), 'collector must run before disposal').toBeUndefined()
      }, { timeout: 1_000, interval: 5 })
      store.$cache.deleteItem({ collection, key: 2, deletedAt: hlc(1) })
      store.$cache.writeItem({ collection, key: 1, item: { id: 1 } })
      const item = store.$cache.readItem({ collection, key: 1 })!
      store.$cache.garbageCollectItem({ collection, item })
      expect(store.$cache.tombstones.get('TestCollection', 2)).toBeDefined()

      store.$cache.dispose()
      store.$cache.dispose()
      await waitForTombstoneSweeps(5)
      expect(store.$cache.tombstones.get('TestCollection', 2), 'disposed collector must retain eligible deletion').toBeDefined()
    }
    finally {
      store.$cache.dispose()
    }
  })
})
