import type { BatchingConfig, CollectionDefaults, FindOptions, Plugin, RetentionOptions, StoreSchema } from '@rstore/shared'
import type { TombstoneGcOptions } from './cache/types'

/** Options of `createStore`. */
export interface CreateStoreOptions<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /**
   * The schema of the store with collections and relations.
   */
  schema: TSchema
  /**
   * Default options for collections.
   */
  collectionDefaults?: TCollectionDefaults
  /**
   * Plugins to extend the store functionality and handle multiple collections and data sources.
   */
  plugins: Array<Plugin>
  /**
   * Default options for find queries.
   */
  findDefaults?: Partial<FindOptions<any, any, any>>
  /**
   * Indicates whether the store is running on the server side.
   */
  isServer?: boolean
  /**
   * Start a sync immediately after store creation.
   */
  syncImmediately?: boolean
  /**
   * Experimental: Enable garbage collection for items that are not referenced by any query or other item.
   */
  experimentalGarbageCollection?: boolean
  /**
   * Bounds for the results saved by queries no longer mounted, which let a
   * remounted query read cache-first. Each distinct set of query options saves
   * one entry. Pass `false` to keep them forever.
   *
   * @default { ttlMs: 1_800_000, maxSize: 500 }
   */
  queryStateRetention?: false | RetentionOptions
  /**
   * Maximum number of items written to the cache every 10ms.
   *
   * Set to `0` to disable staggering.
   *
   * @default 0
   */
  cacheStaggering?: number

  /**
   * Enable operation batching. Multiple findFirst/mutation calls in the same tick
   * will be combined into batch operations.
   *
   * Set to `true` for default options, or provide a `BatchOptions` object for fine-grained control.
   */
  batching?: BatchingConfig

  /**
   * Configuration for the per-cache tombstone garbage collector.
   * Defaults to a 60s sweep with a 24h TTL and at most 10,000 tombstones —
   * long enough for most intermittent connectivity gaps while still bounding
   * the working set. Pass `false` to disable (e.g. on the server).
   */
  tombstoneGc?: false | TombstoneGcOptions

  /**
   * Bounds of `store.$mutationHistory`. Each entry retains its payload.
   * `false` keeps every entry forever; `{ maxSize: 0 }` records nothing.
   *
   * @default { ttlMs: 600_000, maxSize: 20 }
   */
  mutationHistory?: false | RetentionOptions
}
