import type { ResolvedRetention, TombstoneStore } from '@rstore/core'
import type { Cache, CacheHookDefinitions, CacheLayer, Collection, CollectionDefaults, CustomCacheState, CustomHookMeta, FieldTimestamps, QueryResultMode, ResolvedCollection, ResolvedCollectionItem, RetentionOptions, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { WrappedItemMetadata } from '../item'
import type { QueryStateHolder } from './queryHolders'

/** Cache operations delayed while the cache is paused or write staggering is active. */
export type QueuedOperation = {
  /** Opt-in completion flag; ordinary cache operations allocate no tracker. */
  completion?: { completed: boolean }
} & (
  | { type: 'writeItem', params: Parameters<Cache['writeItem']>[0] }
  | { type: 'writeItems', params: Parameters<Cache['writeItems']>[0], index: number, batch: CacheWriteBatch }
  | { type: 'deleteItem', params: Parameters<Cache['deleteItem']>[0] }
  | { type: 'addLayer', layer: Parameters<Cache['addLayer']>[0] }
  | { type: 'removeLayer', layerId: Parameters<Cache['removeLayer']>[0] }
  | { type: 'setState', state: CustomCacheState }
  | { type: 'clear' }
  | { type: 'prune', params: CachePruneParams }
)

/** Deletion of every item of some collections except the ones a refreshed query still holds. */
export interface CachePruneParams {
  /** Names of the collections to prune. */
  collections: string[]
  /** Keys to keep per collection name, as strings. Called once, when the operation runs. */
  getKeptKeys: () => Map<string, Set<string>>
  /** Whether the refresh that requested the prune is still current when the operation runs. */
  canApply: () => boolean
}

/** Public hook payload retained until its complete batch becomes visible. */
type AfterCacheWritePayload = Parameters<CacheHookDefinitions<StoreSchema, CollectionDefaults>['afterCacheWrite']>[0]

/** Reactive collection publications and nested hooks deferred until a writeItems operation settles. */
export interface CacheWriteBatch {
  /** Collections needing one reactive publication at settlement. */
  affectedCollections: Set<string>
  /** Nested write notifications delivered after collection publication. */
  deferredAfterCacheWrites: AfterCacheWritePayload[]
}

/** Saved response identities or absence, with confirmation for a query page. */
export type CachedPageRefs = (
  | {
    /** A single cached row. */
    type: 'ref'
    /** Primary key of the row. */
    key: string | number
  }
  | {
    /** Cached rows in response order. */
    type: 'refs'
    /** Primary keys of the rows. */
    keys: Array<string | number>
  }
  | {
    /** A cached first-query miss, which has no row identity. */
    type: 'data'
    /** Absence returned by the server or cache read. */
    value: null
    /** Key whose absence was returned; omitted for an unkeyed first query. */
    key?: string | number
    /** Membership mode under which absence was published. */
    resultMode?: QueryResultMode
    /** A later cache write released absence while preserving option confirmation. */
    invalidated?: boolean
  }
) & {
  /** Whether these identities came from a server fetch or accepted push. */
  confirmed: boolean
  /** Serializable effective options (function values dropped), including page and refresh overrides. */
  effectiveOptions?: unknown
}

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
  pageRefs: Map<string, CachedPageRefs>
  /** Whether writes should be queued instead of applied immediately. */
  paused: boolean
  /** Pending cache operations. */
  queue: QueuedOperation[]
  /** Per-field timestamps for CRDT field-level LWW merge. */
  fieldTimestamps: Map<string, Map<string | number, FieldTimestamps>>
  /** Deletion tombstones used to reject stale writes after deletes. */
  tombstones: TombstoneStore
}

/** Tombstone collector settings: deletes expire by age and count. */
export interface TombstoneGcOptions extends RetentionOptions {
  /** Sweep interval in ms. Defaults to 60_000. */
  intervalMs?: number
}

export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /** Resolve the owning Core-compatible store. */
  getStore: () => StoreCore<TSchema, TCollectionDefaults>
  /** Maximum number of queued writes processed per 10ms. */
  cacheStaggering?: number
  /** Auto-GC settings for the per-cache tombstone store. */
  tombstoneGc?: false | TombstoneGcOptions
  /** Whether this cache belongs to a server-side store instance. */
  isServer?: boolean
  /** Bounds for saved results of unmounted queries; `false` keeps them forever. */
  queryStateRetention?: false | RetentionOptions
}

/** Mutable runtime shared by cache helper modules. */
export interface CacheRuntime<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Resolve the owning Core-compatible store. */
  getStore: () => StoreCore<TSchema, TCollectionDefaults>
  /** Whether disposal notification has already been emitted. */
  disposed?: boolean
  /** Write staggering budget. */
  cacheStaggering: number
  /** Resolved bounds for saved results of unmounted queries. */
  queryStateRetention: ResolvedRetention | false
  /** Last use (ms) of each saved query id, for retention. */
  queryStateUsedAt: Map<string, number>
  /** Mounted entries found by the last sweep, minus unmounts since. */
  queryStateHeldCount: number
  /** Whether a size-limit sweep is already queued for this task. */
  queryStateSweepQueued?: boolean
  /** Stop the saved-results expiration timer, when one is active. */
  stopQueryStateSweeps?: () => void
  /** Internal reactive cache state. */
  state: InternalCacheState
  /** Diagnostic key hints allocated only after inspection first activates. */
  publicKeys?: Map<string, Map<string, string | number>>
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
  /** Memoized overlay values, invalidated by ordinary cache publication. */
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
    /** Rebuild relation indexes after the store schema changes at runtime. */
    rebuildIndexes: () => void
    /** Queue a prune, so it runs after the writes already queued by the same refresh. */
    prune: (params: CachePruneParams) => void
    /** Record that a live query saved results under `queryId`, for retention. */
    holdQueryState: (queryId: string, holder: QueryStateHolder) => void
    /** Record that a query stopped using the results it last saved. */
    releaseQueryState: (holder: QueryStateHolder) => void
    /** Whether `dispose()` already ran. */
    isDisposed: () => boolean
  }
}
