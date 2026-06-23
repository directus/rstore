import type { TombstoneStore } from '@rstore/core'
import type { Cache, CacheLayer, Collection, CollectionDefaults, CustomCacheState, CustomHookMeta, FieldTimestamps, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { WrappedItemMetadata } from '../item'
import type { VueStore } from '../store'

/** Cache operations delayed while the cache is paused or write staggering is active. */
export type QueuedOperation
  = | { type: 'writeItem', params: Parameters<Cache['writeItem']>[0] }
    | { type: 'writeItems', params: Parameters<Cache['writeItems']>[0], index: number }
    | { type: 'deleteItem', params: Parameters<Cache['deleteItem']>[0] }
    | { type: 'addLayer', layer: Parameters<Cache['addLayer']>[0] }
    | { type: 'removeLayer', layerId: Parameters<Cache['removeLayer']>[0] }
    | { type: 'setState', state: CustomCacheState }
    | { type: 'clear' }

/** Reactive state owned by the Vue cache implementation. */
export interface InternalCacheState {
  /** Query markers used to know whether list results were fetched before. */
  markers: Record<string, boolean>
  /** Collection item state by collection name. */
  collections: Record<string, Ref<Record<string | number, any>>>
  /** Relation/index lookups by collection, index key, and index value. */
  collectionIndexes: Map<string, Map<string, Map<any, Ref<Set<string | number>>>>>
  /** Module state by module cache key. */
  modules: Record<string, Ref<any>>
  /** Last hook metadata for query ids. */
  queryMeta: Record<string, CustomHookMeta>
  /** Saved page references for query pagination. */
  pageRefs: Map<string, { type: 'ref', key: string | number } | { type: 'refs', keys: Array<string | number> }>
  /** Whether writes should be queued instead of applied immediately. */
  paused: boolean
  /** Pending cache operations. */
  queue: QueuedOperation[]
  /** Per-field timestamps for CRDT field-level LWW merge. */
  fieldTimestamps: Map<string, Map<string | number, FieldTimestamps>>
  /** Deletion tombstones used to reject stale writes after deletes. */
  tombstones: TombstoneStore
}

export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /** Resolve the owning Vue store. */
  getStore: () => VueStore<TSchema, TCollectionDefaults>
  /** Maximum number of queued writes processed per 10ms. */
  cacheStaggering?: number
  /** Auto-GC settings for the per-cache tombstone store. */
  tombstoneGc?: false | {
    /** Sweep interval in ms. Defaults to 60_000. */
    intervalMs?: number
    /** Drop tombstones older than this many ms. Defaults to 86_400_000. */
    ttlMs?: number
  }
  /** Whether this cache belongs to a server-side store instance. */
  isServer?: boolean
}

/** Mutable runtime shared by cache helper modules. */
export interface CacheRuntime<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Resolve the owning Vue store. */
  getStore: () => VueStore<TSchema, TCollectionDefaults>
  /** Write staggering budget. */
  cacheStaggering: number
  /** Internal reactive cache state. */
  state: InternalCacheState
  /** Stop the tombstone GC timer, when one is active. */
  stopTombstoneGc?: () => void
  /** Optimistic/cache layers by collection name. */
  layers: Record<string, Ref<CacheLayer[]>>
  /** Collection lookup for layer ids. */
  layerIdToCollectionName: Record<string, string>
  /** Wrapped item proxies by wrap key. */
  wrappedItems: Map<string, WrappedItem<Collection, TCollectionDefaults, TSchema>>
  /** Wrapped item metadata by wrap key. */
  wrappedItemsMetadata: Map<string, WrappedItemMetadata<Collection, TCollectionDefaults, TSchema>>
  /** Wrap keys created for each layer. */
  wrappedItemKeysPerLayer: Map<string, Set<string>>
  /** Cached overlay collection states. */
  collectionStateCache: Map<string, Record<string | number, any>>
  /** Reactivity markers for cached overlay states. */
  collectionStateCacheReactivityMarker: Map<string, Ref<number>>
  /** Whether queued operations are currently being flushed. */
  isFlushingQueue: boolean
  /** Remaining writes before the next staggering pause. */
  staggeringBudget: number
  /** Timer that resets the staggering budget. */
  staggeringResetTimer?: ReturnType<typeof setTimeout>
}

export interface VueCachePrivate {
  _private: {
    state: InternalCacheState
    wrappedItems: Map<string, WrappedItem<Collection, CollectionDefaults, StoreSchema>>
    wrappedItemsMetadata: Map<string, WrappedItemMetadata<Collection, CollectionDefaults, StoreSchema>>
    getWrappedItem: <TCollection extends Collection>(
      collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
      item: ResolvedCollectionItem<TCollection, CollectionDefaults, StoreSchema> | null | undefined,
      noCache?: boolean,
    ) => WrappedItem<TCollection, CollectionDefaults, StoreSchema> | undefined
    layers: Record<string, Ref<CacheLayer[]>>
    ensureLayersForCollection: (collectionName: string) => Ref<CacheLayer[]>
  }
}
