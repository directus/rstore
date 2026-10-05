import type { CacheItemMetadata, CustomCacheWriteMetadata, SerializedCacheItemMetadata } from './cacheMetadata'
import type { Collection, CollectionDefaults, CollectionRelation, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from './collection'
import type { DeprecatedCacheDeleteAliases, DeprecatedCacheMethods, DeprecatedCacheWriteAliases } from './deprecatedAliases'
import type { CustomHookMeta } from './hooks'
import type { WrappedItem } from './item'
import type { CacheLayer } from './layer'
import type { Module, ResolvedModuleState } from './module'
import type { ApplyMutationOptions, ApplyMutationResult } from './mutation'

/*

Markers are used to track if a query (usually with a filter) was already fetched once.
This is useful to return an empty list from the cache if the list was never actually fetched despite part of it potentially being in the cache -
which is a nice default for most apps.
The markers can be overwritten by plugins using the `payload.setMarker` method.

Example:

1. Fetch a single user with id 1
2. Go to all users page
3. Peek the cache for users

If there wasn't a marker, the cache would return a list with the single user that was specifically fetched in step 1.

4. See that there is no marker for this list (by default taking into account: collection.name, params object, filter object) => return empty list
5. Cache miss => fetch all users

*/

export interface CustomCacheState {
  /**
   * Item metadata of the namespaces registered with `serialize` (the default):
   * namespace → collection → key → value.
   */
  itemMetadata?: SerializedCacheItemMetadata
}

export interface WriteItem<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  key: string | number
  value: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
  /** Opaque per-write data for cache hooks (see `cacheBeforeWriteItem`). */
  metadata?: CustomCacheWriteMetadata
}

export interface Cache<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> extends DeprecatedCacheMethods {
  readItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
  }) => WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined

  writeItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    marker?: string
    fromWriteItems?: boolean
    meta?: CustomHookMeta
    /** Opaque per-write data for cache hooks (see `cacheBeforeWriteItem`). */
    metadata?: CustomCacheWriteMetadata
  } & DeprecatedCacheWriteAliases) => void

  deleteItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    /** Opaque per-delete data for cache hooks (see `cacheBeforeDeleteItem`). */
    metadata?: CustomCacheWriteMetadata
  } & DeprecatedCacheDeleteAliases) => void

  readItems: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    /**
     * Marker to consider that the corresponding list was already fetched once. Allow returning empty list if marker is not found.
     */
    marker?: string
    /**
     * Filter the items to include.
     */
    filter?: (item: WrappedItem<TCollection, TCollectionDefaults, TSchema>) => boolean
    /**
     * Specific keys to read.
     */
    keys?: Array<string | number>
    /**
     * Limit the number of items returned.
     */
    limit?: number
    /**
     * Index key to use for reading items. Used for resolving relations.
     *
     * Example: `field1:field2`
     */
    indexKey?: string
    /**
     * Value of the index to filter items by.
     */
    indexValue?: any
  }) => Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>

  writeItems: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    items: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>>
    /**
     * Marker to consider that the corresponding list was already fetched once.
     */
    marker?: string
    meta?: CustomHookMeta
  }) => void

  writeItemForRelation: <TCollection extends Collection = Collection>(params: {
    parentCollection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    relationKey: keyof ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>['relations']
    relation: CollectionRelation
    childItem: any
    meta?: CustomHookMeta
  }) => void

  /**
   * Apply mutation-shaped changes directly to cache without emitting mutation hooks.
   */
  applyMutation: <TCollection extends Collection = Collection>(params: ApplyMutationOptions<TCollection, any, any>) => ApplyMutationResult

  /**
   * Namespaced per-item plugin data stored beside cache rows.
   */
  itemMetadata: CacheItemMetadata

  getModuleState: <TModule extends Module> (name: TModule['name'], key: string, initState: TModule['state']) => ResolvedModuleState<TModule>

  getState: () => CustomCacheState

  setState: (state: CustomCacheState) => void

  clear: () => void

  clearCollection: (params: {
    collection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  }) => void

  wrapItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    noCache?: boolean
  }) => WrappedItem<TCollection, TCollectionDefaults, TSchema>

  garbageCollectItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    item: WrappedItem<TCollection, TCollectionDefaults, TSchema>
  }) => void

  garbageCollect: () => void

  addLayer: (layer: CacheLayer) => void

  getLayer: (layerId: string) => CacheLayer | undefined

  removeLayer: (layerId: string) => void

  /**
   * Pause cache updates to prevent flickering. Queued updates will be applied when `resume()` is called.
   */
  pause: () => void

  /**
   * Resume cache updates and apply all queued updates.
   */
  resume: () => void

  /**
   * Call the `dispose` hook, where plugins stop their timers and channels.
   * Safe to call multiple times: the hook fires once. Mainly used by tests and
   * by embedding apps that recreate the cache between tenants/sessions.
   */
  dispose: () => void
}
