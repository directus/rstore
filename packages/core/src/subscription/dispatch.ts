import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, GlobalStoreType, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'

/** Shared input carried by subscribe and unsubscribe public facades. */
export interface SubscriptionDispatchOptions<
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

type SubscriptionHookKind = 'subscribe' | 'unsubscribe'

/** Dispatch one realtime registration hook with established meta defaults. */
export async function dispatchSubscription<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  hook: SubscriptionHookKind,
  {
    store,
    collection,
    subscriptionId,
    key,
    findOptions,
    meta,
  }: SubscriptionDispatchOptions<TCollection, TCollectionDefaults, TSchema>,
): Promise<void> {
  const resolvedMeta = meta ?? findOptions?.meta ?? {}
  const payload = {
    store: store as unknown as GlobalStoreType,
    meta: resolvedMeta,
    collection,
    subscriptionId,
    key,
    findOptions,
  }

  if (hook === 'subscribe') {
    await store.$hooks.callHook('subscribe', payload)
  }
  else {
    await store.$hooks.callHook('unsubscribe', payload)
  }
}
