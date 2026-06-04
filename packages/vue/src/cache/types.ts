import type { StoreEngine, TombstoneGcOptions } from '@rstore/core'
import type { CacheLayer, Collection, CollectionDefaults, CustomHookMeta, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { WrappedItemMetadata } from '../item'
import type { VueStore } from '../store'
import type { SignalRegistry } from './signals'

/** Bridge-owned state surfaced to Vue internals. */
export interface VueCacheState {
  /** Cached raw page data keyed by page id, used by query pagination. */
  pageRefs: Map<string, any>
  /** Live per-query metadata, backed by the engine for SSR round-trips. */
  queryMeta: Record<string, CustomHookMeta>
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
  /** Bridge-owned state used by Vue query helpers. */
  state: VueCacheState
  /** Vue signal registry subscribed to engine observers. */
  signals: SignalRegistry
  /** Devtools layer mirror by collection name. */
  layers: Record<string, Ref<CacheLayer[]>>
  /** Devtools layer id to collection lookup. */
  layerIdToCollectionName: Record<string, string>
  /** Wrapped item proxies by wrap key. */
  wrappedItems: Map<string, WrappedItem<Collection, TCollectionDefaults, TSchema>>
  /** Wrapped item metadata by wrap key. */
  wrappedItemsMetadata: Map<string, WrappedItemMetadata<Collection, TCollectionDefaults, TSchema>>
  /** Wrap keys created for each layer. */
  wrappedItemKeysPerLayer: Map<string, Set<string>>
}

/** Private Vue cache surface consumed by existing Vue internals and devtools. */
export interface VueCachePrivate {
  _private: {
    /** Bridge-owned cache state. */
    state: VueCacheState
    /** Wrapped item proxies by wrap key. */
    wrappedItems: Map<string, WrappedItem<Collection, CollectionDefaults, StoreSchema>>
    /** Wrapped item metadata by wrap key. */
    wrappedItemsMetadata: Map<string, WrappedItemMetadata<Collection, CollectionDefaults, StoreSchema>>
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
    /** Signal registry used by diagnostics and leak tests. */
    signals: SignalRegistry
  }
}
