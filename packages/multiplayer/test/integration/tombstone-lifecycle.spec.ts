import type { MultiplayerPluginOptions } from '@rstore/multiplayer'
import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { createMultiplayerPlugin, getTombstone, tombstoneEntries } from '@rstore/multiplayer'
import { stringifyHLC } from '@rstore/multiplayer/clock'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Encode a deterministic HLC timestamp for cache wiring tests. */
function hlc(physical: number): string {
  return stringifyHLC({ physical, logical: 0, nodeId: 'test' })
}

/**
 * Create a store using the plugin, with tombstone GC off unless a lifecycle
 * case passes settings (`undefined` means the defaults).
 */
async function createTestStore(options: Record<string, any> = {}, ...tombstoneGc: [MultiplayerPluginOptions['tombstoneGc']?]) {
  return createStore({
    schema: [{ name: 'TestCollection' }],
    plugins: [createMultiplayerPlugin({ tombstoneGc: tombstoneGc.length ? tombstoneGc[0] : false })],
    ...options,
  } as any) as Promise<any>
}

/** `deletedAt` of the tombstone of one item, if any. */
function tombstone(store: any, key: string | number) {
  return getTombstone(store, 'TestCollection', key)?.deletedAt
}

afterEach(() => vi.useRealTimers())

describe('multiplayer tombstone lifecycle', () => {
  it('records causal deletes and ignores deletes without a timestamp', async () => {
    const store = await createTestStore()
    const collection = store.$collections[0]!
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'before' } })
    store.$cache.deleteItem({ collection, key: 1, metadata: { deletedAt: hlc(200) } })
    store.$cache.deleteItem({ collection, key: 2 })

    expect(tombstone(store, 1)).toBe(hlc(200))
    expect(tombstone(store, 2)).toBeUndefined()
  })

  it('drops losing writes, applies winning writes, and lets an unstamped write resurrect', async () => {
    const store = await createTestStore()
    const collection = store.$collections[0]!
    store.$cache.deleteItem({ collection, key: 1, metadata: { deletedAt: hlc(500) } })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'ghost' }, metadata: { fieldTimestamps: { name: hlc(200) } } })
    expect(store.$cache.readItem({ collection, key: 1 })).toBeUndefined()

    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'reborn' }, metadata: { fieldTimestamps: { name: hlc(600) } } })
    expect(store.$cache.readItem({ collection, key: 1 })?.name).toBe('reborn')
    expect(tombstone(store, 1)).toBeUndefined()

    store.$cache.deleteItem({ collection, key: 1, metadata: { deletedAt: hlc(700) } })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1, name: 'explicit' } })
    expect(store.$cache.readItem({ collection, key: 1 })?.name).toBe('explicit')
  })

  it('keeps clear boundaries for all collections and one collection', async () => {
    const store = await createTestStore({ schema: [{ name: 'A' }, { name: 'B' }] })
    const [a, b] = store.$collections
    store.$cache.deleteItem({ collection: a!, key: 1, metadata: { deletedAt: hlc(100) } })
    store.$cache.deleteItem({ collection: b!, key: 2, metadata: { deletedAt: hlc(100) } })
    store.$cache.clearCollection({ collection: a! })
    expect(getTombstone(store, 'A', 1)).toBeUndefined()
    expect(getTombstone(store, 'B', 2)).toBeDefined()

    store.$cache.clear()
    expect(Array.from(tombstoneEntries(store))).toEqual([])
  })

  it('uses default client timer settings, and none when disabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(24 * 60 * 60 * 1000 + 10))
    const store = await createTestStore({}, undefined)
    const disabled = await createTestStore({}, false)
    for (const target of [store, disabled]) {
      target.$cache.deleteItem({ collection: target.$collections[0]!, key: 1, metadata: { deletedAt: hlc(1) } })
    }

    await vi.advanceTimersByTimeAsync(60_000)
    expect(tombstone(store, 1)).toBeUndefined()
    expect(tombstone(disabled, 1)).toBeDefined()
  })

  it('forwards custom timer settings and installs no timer server-side', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(10_000))
    const custom = await createTestStore({}, { intervalMs: 100, ttlMs: 500 })
    custom.$cache.deleteItem({ collection: custom.$collections[0]!, key: 1, metadata: { deletedAt: hlc(1) } })
    await vi.advanceTimersByTimeAsync(100)
    expect(tombstone(custom, 1)).toBeUndefined()

    const server = await createTestStore({ isServer: true }, { intervalMs: 100, ttlMs: 500 })
    server.$cache.deleteItem({ collection: server.$collections[0]!, key: 1, metadata: { deletedAt: hlc(1) } })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(tombstone(server, 1)).toBeDefined()
  })

  it('stops the timer idempotently and never lets item eviction touch tombstones', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(10_000))
    const store = await createTestStore({}, { intervalMs: 100, ttlMs: 500 })
    const collection = store.$collections[0]!
    store.$cache.deleteItem({ collection, key: 2, metadata: { deletedAt: hlc(1) } })
    store.$cache.writeItem({ collection, key: 1, item: { id: 1 } })
    const item = store.$cache.readItem({ collection, key: 1 })!
    store.$cache.garbageCollectItem({ collection, item })
    expect(tombstone(store, 2)).toBeDefined()

    store.$cache.dispose()
    store.$cache.dispose()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(tombstone(store, 2)).toBeDefined()
  })
})
