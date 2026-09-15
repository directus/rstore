import type { Cache, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { normalizeCollectionRelations, resolveCollectionOppositeRelations, resolveCollections } from '@rstore/core'

/** Cache constructor accepted by benchmark and differential scenarios. */
export type CacheFactory = (options: {
  /** Resolve equivalent benchmark store state. */
  getStore: () => any
  /** Disable client-only work when requested. */
  isServer?: boolean
  /** Disable timer-driven tombstone collection. */
  tombstoneGc?: false
}) => Cache

/** Named implementation used for validation and reporting. */
export interface CacheImplementation {
  /** Report label. */
  name: 'legacy' | 'engine'
  /** Cache factory. */
  create: CacheFactory
}

/** Minimal equivalent store/cache runtime used by synthetic workloads. */
export interface CacheRuntimeHarness {
  /** Cache under test. */
  cache: Cache
  /** Resolved schema collections. */
  collections: ResolvedCollection<any, any, any>[]
}

/** Hook observer used by semantic differential traces. */
export type CacheHookSink = (name: string, payload: any) => void

/** Wire one cache implementation to a normalized minimal store. */
export function createCacheRuntime(
  implementation: CacheImplementation,
  schema: StoreSchema,
  onHook: CacheHookSink = () => {},
): CacheRuntimeHarness {
  const collections = resolveCollections(schema) as unknown as ResolvedCollection<any, any, any>[]
  normalizeCollectionRelations(collections)
  resolveCollectionOppositeRelations(collections)
  const store: any = {
    $collections: collections,
    $getCollection: (_item: any, names: string[]) => collections.find(collection => names.includes(collection.name)),
    $hooks: { callHookSync: onHook },
  }
  const cache = implementation.create({ getStore: () => store, isServer: false, tombstoneGc: false })
  store.$cache = cache
  return { cache, collections }
}
