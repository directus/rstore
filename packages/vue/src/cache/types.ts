import type { StoreEngine, TombstoneGcOptions } from '@rstore/core'
import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { VueStore } from '../store'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { ItemCellRegistry } from './itemCells'
import type { SignalRegistry } from './signals'
import type { CacheVersionRegistry } from './versions'
import type { WrappedItemRegistry } from './wrappedRegistry'

/** Bridge-owned state surfaced to Vue internals. */
export interface VueCacheState {
  /** Cached raw page data keyed by page id, used by query pagination. */
  pageRefs: Map<string, any>
  /** Live per-query metadata, backed by the engine for SSR round-trips. */
  readonly queryMeta: Record<string, CustomHookMeta>
}

/** Options used to create the Vue cache bridge. */
export interface CreateCacheOptions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /** Resolve the owning Vue store. */
  getStore: () => VueStore<TSchema, TCollectionDefaults>
  /** Maximum number of queued writes processed per 10ms by the engine. */
  cacheStaggering?: number
  /** Auto-GC settings for the per-cache tombstone store. */
  tombstoneGc?: TombstoneGcOptions
  /** Whether this cache belongs to a server-side store instance. */
  isServer?: boolean
}

/** Mutable runtime shared by the Vue cache bridge modules. */
export interface CacheRuntime<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  /** Resolve the owning Vue store. */
  getStore: () => VueStore<TSchema, TCollectionDefaults>
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
  }
}
