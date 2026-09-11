import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { SubscriptionDispatchOptions } from './dispatch'
import { dispatchSubscription } from './dispatch'

export interface SubscribeOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> extends SubscriptionDispatchOptions<TCollection, TCollectionDefaults, TSchema> {}

export async function subscribe<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(options: SubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  return dispatchSubscription('subscribe', options)
}
