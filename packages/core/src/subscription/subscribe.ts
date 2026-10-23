import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, GlobalStoreType, QueryRefreshOptions, ResolvedCollection, SetSubscriptionResult, StoreCore, StoreSchema } from '@rstore/shared'

export interface SubscribeOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  subscriptionId: string
  /** Followed live page index, when paginated. */
  pageIndex?: number
  key?: string | number
  findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
  meta?: CustomHookMeta
  /** Publishes a result for the followed page of the owning live query, if any. */
  setResult?: SetSubscriptionResult
  /** Refetches the followed page of the live query the subscription belongs to, if any. */
  refresh?: (options?: QueryRefreshOptions<FindOptions<TCollection, TCollectionDefaults, TSchema>>) => Promise<unknown>
}

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
  meta,
  refresh,
  setResult,
  pageIndex,
}: SubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  meta ??= findOptions?.meta ?? {}

  await store.$hooks.callHook('subscribe', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    subscriptionId,
    key,
    findOptions,
    refresh,
    setResult,
    pageIndex,
  })
}
