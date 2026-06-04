import type { Collection, CollectionDefaults, CollectionRelation, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from './collection'
import type { FieldTimestamps, FieldTimestampValue } from './crdt'
import type { CustomHookMeta } from './hooks'
import type { WrappedItem } from './item'
import type { CacheLayer } from './layer'
import type { Module, ResolvedModuleState } from './module'
import type { ApplyMutationOptions, ApplyMutationResult } from './mutation'

/**
 * A tombstone records the causal timestamp of a deletion so concurrent
 * writes arriving after the delete can be suppressed (or applied, if newer).
 */
export interface CacheTombstone {
  collection: string
  key: string | number
  deletedAt: FieldTimestampValue
}

/**
 * Read-only view of the cache's tombstone index.
 */
export interface CacheTombstones {
  get: (collection: string, key: string | number) => CacheTombstone | undefined
  entries: () => IterableIterator<[string, CacheTombstone]>
  size: () => number
}

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

/**
 * Serializable snapshot of the store engine's state (used for SSR transfer).
 *
 * These are the canonical fields the engine reads and writes. The interface
 * stays open for declaration merging so a host framework can attach extra
 * state if needed.
 */
export interface CustomCacheState {
  markers: Record<string, boolean>
  collections: Record<string, Record<string | number, any>>
  modules: Record<string, any>
  queryMeta: Record<string, CustomHookMeta>
}

export interface WriteItem<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  key: string | number
  value: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
}

export interface Cache<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  readItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
  }) => WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined

  writeItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    marker?: string
    fromWriteItems?: boolean
    meta?: CustomHookMeta
    /**
     * Per-field timestamps for CRDT-like field-level LWW merge.
     * When provided, the cache will merge at the field level using
     * Last-Writer-Wins strategy instead of overwriting the entire object.
     */
    fieldTimestamps?: FieldTimestamps
  }) => void

  deleteItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    /**
     * Causal timestamp (HLC string or legacy number) of the delete.
     * When provided, a tombstone is recorded so that concurrent writes
     * older than this timestamp are dropped.
     */
    deletedAt?: FieldTimestampValue
  }) => void

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
   * Read the per-field timestamps for an item.
   * Returns undefined if no timestamps are stored for the item.
   */
  readFieldTimestamps: (params: {
    collectionName: string
    key: string | number
  }) => FieldTimestamps | undefined

  /**
   * Write per-field timestamps for an item.
   */
  writeFieldTimestamps: (params: {
    collectionName: string
    key: string | number
    timestamps: FieldTimestamps
  }) => void

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

  /**
   * Read-only access to the tombstone index. Useful for devtools/debug
   * and protocol publishers that want to replay deletions to new subscribers.
   */
  tombstones: CacheTombstones

  /**
   * Drop tombstones older than the given cutoff (HLC string or numeric).
   * Pass a number `n` to drop tombstones whose `deletedAt.physical < n`.
   */
  gcTombstones: (olderThan: FieldTimestampValue) => Array<{ collection: string, key: string | number }>

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
   * Tear down any background timers (e.g. tombstone GC) owned by the
   * cache. Safe to call multiple times. Mainly used by tests and by
   * embedding apps that recreate the cache between tenants/sessions.
   */
  dispose: () => void
}
