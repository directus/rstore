import type { BatchingConfig, Cache, CollectionDefaults, FindOptions, Plugin, StoreCore, StoreSchema } from '@rstore/shared'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createStore } from '../../../packages/vue/src'
// eslint-disable-next-line no-restricted-imports -- Shared factory wires actual Core to existing real cache; no public cache export exists.
import { createCache } from '../../../packages/vue/src/cache'

/**
 * A Core-compatible store backed by the real Vue cache.
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
  /** Factory boundary; Vue remains the historical default. */
  factory?: 'vue' | 'core'
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
 * Create through public Vue factory by default or actual Core factory explicitly.
 *
 * @param options Schema, plugins and store behaviour.
 */
export async function createCoreStore(options: CoreStoreOptions): Promise<CoreStore> {
  const storeOptions = {
    schema: options.schema,
    collectionDefaults: options.collectionDefaults,
    plugins: options.plugins ?? [],
    findDefaults: options.findDefaults,
    isServer: options.isServer,
    syncImmediately: options.syncImmediately,
    batching: options.batching,
    cacheStaggering: options.cacheStaggering,
    tombstoneGc: options.tombstoneGc,
  }
  let store: StoreCore<StoreSchema, CollectionDefaults>
  if (options.factory === 'core') {
    const cache = createCache({
      getStore: () => store,
      cacheStaggering: options.cacheStaggering,
      tombstoneGc: options.tombstoneGc,
      isServer: options.isServer,
    })
    try {
      store = await createStoreCore({
        ...storeOptions,
        cache,
        hooks: createHooks(),
        // Bind before plugin setup/init: those hooks may use cache immediately.
        transformStore: (owner) => {
          store = owner
          return owner
        },
      })
    }
    catch (error) {
      // Cleanup observers must not replace the original construction failure.
      try {
        cache.dispose()
      }
      catch {
        // Original construction error is the actionable failure.
      }
      throw error
    }
  }
  else {
    store = await createStore(storeOptions)
  }
  const cache = store.$cache

  return {
    store: store as StoreCore<StoreSchema, CollectionDefaults>,
    cache,
    dispose: () => cache.dispose(),
  }
}
