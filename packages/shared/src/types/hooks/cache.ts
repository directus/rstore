import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { FieldConflict } from '../crdt'
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
   * Called when a CRDT field-level merge detects conflicts.
   */
  cacheConflict: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      conflicts: FieldConflict[]
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
