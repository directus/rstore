import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { GlobalStoreType } from '../global'
import type { Awaitable } from '../utils'
import type { CustomHookMeta } from './meta'

/**
 * Offline/local synchronization hooks.
 */
export interface SyncHookDefinitions<
  TSchema extends StoreSchema,
  _TCollectionDefaults extends CollectionDefaults,
> {
  sync: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      /** Update sync progress. */
      setProgress: (info: { percent: number, message?: string }) => void
      /** Mark a collection as loaded from local storage. */
      setCollectionLoaded: (collectionName: string) => void
      /** Mark a collection as successfully synced with remote. */
      setCollectionSynced: (collectionName: string) => void
    },
  ) => Awaitable<void>

  syncCollection: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<Collection, CollectionDefaults, TSchema>
      /** Date of the last successful collection sync. */
      lastUpdatedAt?: Date
      /** Items loaded from local storage. */
      loadedItems: () => Array<ResolvedCollectionItemBase<Collection, CollectionDefaults, TSchema>>
      /** Store result items fetched from remote. */
      storeItems: (items: Array<ResolvedCollectionItemBase<Collection, CollectionDefaults, TSchema>>) => void
      /** Delete items if they no longer exist remotely. */
      deleteItems: (keys: Array<string | number>) => void
    },
  ) => Awaitable<void>
}
