import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '../collection'
import type { GlobalStoreType } from '../global'
import type { FindOptions } from '../query'
import type { Awaitable } from '../utils'
import type { CustomHookMeta } from './meta'

/**
 * Subscription hooks.
 */
export interface RealtimeHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  subscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /** The subscription ID used for unsubscribe. */
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>

  unsubscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>
}
