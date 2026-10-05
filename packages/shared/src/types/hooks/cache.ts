import type { CustomCacheWriteMetadata } from '../cacheMetadata'
import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { GlobalStoreType } from '../global'
import type { CacheLayer } from '../layer'
import type { Awaitable } from '../utils'
import type { CustomHookMeta } from './meta'

/**
 * Cache and cache-layer hooks.
 */
export interface CacheHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  afterCacheWrite: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      result?: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      marker?: string
      operation: 'write' | 'delete'
    },
  ) => void

  /**
   * Called before a write reaches the committed cache state, inside the queued
   * cache flush (so `pause()`/`resume()` and staggering keep their order).
   * Runs for `writeItem`, every item of `writeItems`, mutation results and
   * relation children. Handlers may replace the stored row or drop the write.
   * Must be synchronous.
   */
  cacheBeforeWriteItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      /** Committed row before this write (no optimistic layers). Do not mutate. */
      existing: Readonly<Record<string, any>> | undefined
      /** Incoming scalar fields; relation fields are already split off. Do not mutate. */
      incoming: Readonly<Record<string, any>>
      /** Opaque data passed with the write. */
      metadata: CustomCacheWriteMetadata | undefined
      /**
       * Replace the whole row that will be stored (not merged with `existing`).
       * Relation indexes are updated from it. The last call wins.
       */
      setValue: (value: Record<string, any>) => void
      /** Drop the write: no state, marker or relation change, no `afterCacheWrite`. */
      skip: () => void
      /** Mark metadata keys as handled, silencing the dev warning about unconsumed keys. */
      consume: (...keys: Array<keyof CustomCacheWriteMetadata>) => void
    },
  ) => void

  /**
   * Called before an item is deleted from the committed cache state by
   * `deleteItem` or a delete mutation, inside the queued cache flush.
   * Not called for evictions (garbage collection, prune, clear). Must be synchronous.
   */
  cacheBeforeDeleteItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      /** Committed row before the delete, if any. Do not mutate. */
      existing: Readonly<Record<string, any>> | undefined
      /** Opaque data passed with the delete. */
      metadata: CustomCacheWriteMetadata | undefined
      /** Keep the row. */
      skip: () => void
      /** Mark metadata keys as handled, silencing the dev warning about unconsumed keys. */
      consume: (...keys: Array<keyof CustomCacheWriteMetadata>) => void
    },
  ) => void

  afterCacheReset: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
    },
  ) => void

  itemGarbageCollect: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>

  cacheLayerAdd: (
    payload: {
      store: GlobalStoreType
      layer: CacheLayer
    },
  ) => Awaitable<void>

  cacheLayerRemove: (
    payload: {
      store: GlobalStoreType
      layer: CacheLayer
    },
  ) => Awaitable<void>
}
