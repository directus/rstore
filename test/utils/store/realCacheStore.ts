import type { BatchingConfig, Cache, CollectionDefaults, FindOptions, Plugin, StoreCore, StoreSchema } from '@rstore/shared'
import { createStore } from '../../../packages/vue/src'

/**
 * A core-compatible store wired through the public Vue store factory.
 *
 * Core tests historically ran against `test/mutation/mockCache.ts`,
 * a second implementation of `packages/vue/src/cache/mutations.ts`. Anything
 * asserted against that double could drift from the real cache without a
 * single test turning red, so core suites build their store here instead.
 */
export interface CoreStore {
  /** The core store, with real hooks and the real cache. */
  store: StoreCore<StoreSchema, CollectionDefaults>
  /** The cache backing the store, for reads through the public `Cache` API. */
  cache: Cache
  /** Stops the cache background work (tombstone GC timer). */
  dispose: () => void
}

/** Options of {@link createCoreStore}. */
export interface CoreStoreOptions {
  /** The collections of the store. */
  schema: StoreSchema
  /** Plugins to register, e.g. a fake remote. */
  plugins?: Plugin[]
  /** Defaults merged into every collection. */
  collectionDefaults?: CollectionDefaults
  /** Defaults merged into every find call. */
  findDefaults?: Partial<FindOptions<any, any, any>>
  /** Marks the store as server-side (no subscriptions, no tombstone GC). */
  isServer?: boolean
  /** Operation batching configuration. */
  batching?: BatchingConfig
  /** Runs a sync right after creation. Defaults to the store's own default. */
  syncImmediately?: boolean
  /** Maximum number of items written to the cache every 10ms. */
  cacheStaggering?: number
  /** Tombstone garbage collection settings. `false` disables the timer. */
  tombstoneGc?: false | { intervalMs?: number, ttlMs?: number }
}

/**
 * Creates a core-compatible store through public `createStore`.
 *
 * @param options Schema, plugins and store behaviour.
 */
export async function createCoreStore(options: CoreStoreOptions): Promise<CoreStore> {
  const store = await createStore({
    schema: options.schema,
    collectionDefaults: options.collectionDefaults,
    plugins: options.plugins ?? [],
    findDefaults: options.findDefaults,
    isServer: options.isServer,
    syncImmediately: options.syncImmediately,
    batching: options.batching,
    cacheStaggering: options.cacheStaggering,
    tombstoneGc: options.tombstoneGc,
  })
  const cache = store.$cache

  return {
    store: store as StoreCore<StoreSchema, CollectionDefaults>,
    cache,
    dispose: () => cache.dispose(),
  }
}
