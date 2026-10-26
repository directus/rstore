import type { Collection, CollectionDefaults, CustomHookMeta, EndSubscription, FindFirstOptions, FindOptions, GlobalStoreType, QueryRefreshOptions, ResolvedCollection, SetSubscriptionResult, StoreCore, StoreSchema } from '@rstore/shared'

import { klona } from 'klona'

/** Inputs for opening a resolved realtime subscription. */
export interface SubscribeOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /** Owning store. */
  store: StoreCore<TSchema, TCollectionDefaults>
  /** Collection whose updates are followed. */
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  /** Transport identity used during teardown. */
  subscriptionId: string
  /** Followed live page index, when paginated. */
  pageIndex?: number
  /** Item key, also accepted through find options. */
  key?: string | number
  /** Caller options; defaults and resolveFindOptions hooks run before dispatch. */
  findOptions?: FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
  /** Query cardinality; defaults to whether an item key is absent. */
  many?: boolean
  /** Metadata shared with option resolution and subscription hooks. */
  meta?: CustomHookMeta
  /** Publishes a result for the followed page of the owning live query, if any. */
  setResult?: SetSubscriptionResult
  /** Report server termination of the followed live page, if any. */
  end?: EndSubscription
  /** Refetches the followed page of the live query the subscription belongs to, if any. */
  refresh?: (options?: QueryRefreshOptions<FindOptions<TCollection, TCollectionDefaults, TSchema>>) => Promise<unknown>
}

/** Resolve a subscription's server read before handing it to connectors. */
export async function subscribe<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  subscriptionId,
  key,
  findOptions,
  many,
  meta,
  refresh,
  setResult,
  end,
  pageIndex,
}: SubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  meta ??= findOptions?.meta ?? {}
  key ??= findOptions?.key
  findOptions ??= {}
  // Object spread would discard the non-enumerable resolution marker.
  if (key != null && findOptions.key !== key)
    findOptions = Object.assign(Object.create(Object.getPrototypeOf(findOptions), Object.getOwnPropertyDescriptors(findOptions)), { key }) as FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
  // Preserve the resolution marker when Vue already resolved page options.
  findOptions = store.$resolveFindOptions(collection, findOptions, many ?? (key == null), meta)
  key = findOptions.key

  await store.$hooks.callHook('subscribe', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    subscriptionId,
    key,
    // Hook mutation must not alter the snapshot retained for unsubscribe.
    findOptions: klona(findOptions),
    refresh,
    setResult,
    end,
    pageIndex,
  })
}
