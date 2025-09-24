import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, GlobalStoreType, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'

export interface SubscribeOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  subscriptionId: string
  key?: string | number
  findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
  meta?: CustomHookMeta
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
}: SubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  meta ??= {}

  await store.$hooks.callHook('subscribe', {
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    subscriptionId,
    key,
    findOptions,
  })
}
