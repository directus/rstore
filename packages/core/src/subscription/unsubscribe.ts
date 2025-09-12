import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'

export interface UnsubscribeOptions<
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

export async function unsubscribe<
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
}: UnsubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  meta ??= {}

  await store.$hooks.callHook('unsubscribe', {
    store,
    meta,
    collection,
    subscriptionId,
    key,
    findOptions,
  })
}
