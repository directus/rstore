import type { PruneParams, ResolvedRetention, StoreEngine, TombstoneGcOptions } from '@rstore/core'
import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, QueryResultMode, ResolvedCollection, ResolvedCollectionItem, RetentionOptions, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { IndexResultCache } from './indexResultCache'
import type { ItemCellRegistry } from './itemCells'
import type { QueryStateHolder } from './queryHolders'
import type { SignalRegistry } from './signals'
import type { CacheVersionRegistry } from './versions'
import type { WrappedItemRegistry } from './wrappedRegistry'

export type { TombstoneGcOptions }

/** Deletion of every unkept item of some collections, queued after earlier writes. */
export type CachePruneParams = Omit<PruneParams, 'onPruned'>

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

/** Bridge-owned state surfaced to Vue internals. */
export interface VueCacheState {
  /** Saved page references keyed by page id, used by query pagination. */
  pageRefs: Map<string, CachedPageRefs>
  /** Live per-query metadata, backed by the engine for SSR round-trips. */
  readonly queryMeta: Record<string, CustomHookMeta>
}

/** Options used to create the Vue cache bridge. */
export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /** Resolve the owning Core-compatible store. */
  getStore: () => StoreCore<TSchema, TCollectionDefaults>
  /** Maximum number of queued writes processed per 10ms by the engine. */
  cacheStaggering?: number
  /** Auto-GC settings for the per-cache tombstone store. */
  tombstoneGc?: false | TombstoneGcOptions
  /** Whether this cache belongs to a server-side store instance. */
  isServer?: boolean
  /** Bounds for saved results of unmounted queries; `false` keeps them forever. */
  queryStateRetention?: false | RetentionOptions
}

/** Mutable runtime shared by the Vue cache bridge modules. */
export interface CacheRuntime<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Resolve the owning Core-compatible store. */
  getStore: () => StoreCore<TSchema, TCollectionDefaults>
  /** Whether disposal notification has already been emitted. */
  disposed?: boolean
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
  /** Framework-agnostic engine that owns storage and write semantics. */
  engine: StoreEngine<TSchema, TCollectionDefaults>
  /** Active dependencies exposed to Core's selective journal. */
  changeInterest: CacheChangeInterestRegistry
  /** Bridge-owned state used by Vue query helpers. */
  state: VueCacheState
  /** Vue signal registry subscribed to engine observers. */
  signals: SignalRegistry
  /** Wrapper-owned exact item cells synchronized after commits. */
  itemCells: ItemCellRegistry
  /** Reactive fallback for Vue computed getters without a scope owner. */
  versions: CacheVersionRegistry
  /** Devtools layer mirror by collection name. */
  layers: Record<string, Ref<CacheLayer[]>>
  /** Structured wrapped-item identities and metadata. */
  wrappedItems: WrappedItemRegistry<TCollectionDefaults, TSchema>
  /** Stable visible-list wrappers reused until cache membership can change. */
  visibleListCache: Map<string, Array<WrappedItem<Collection, TCollectionDefaults, TSchema>>>
  /** Bounded weak exact-index wrapper results retained until membership changes. */
  indexResultCache: IndexResultCache
}

/** Private Vue cache surface consumed by existing Vue internals and devtools. */
export interface VueCachePrivate {
  _private: {
    /** Bridge-owned cache state. */
    state: VueCacheState
    /** Return an existing wrapped item or create one for the raw item. */
    getWrappedItem: <TCollection extends Collection>(
      collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
      item: ResolvedCollectionItem<TCollection, CollectionDefaults, StoreSchema> | null | undefined,
      noCache?: boolean,
    ) => WrappedItem<TCollection, CollectionDefaults, StoreSchema> | undefined
    /** Devtools layer mirror by collection name. */
    layers: Record<string, Ref<CacheLayer[]>>
    /** Ensure a devtools layer mirror exists for a collection. */
    ensureLayersForCollection: (collectionName: string) => Ref<CacheLayer[]>
    /** Rebuild engine indexes after a runtime schema change. */
    rebuildIndexes: () => void
    /** Read a committed row, ignoring optimistic layers. */
    readCommittedItem: (collection: ResolvedCollection<any, any, any>, key: string | number) => any | undefined
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
