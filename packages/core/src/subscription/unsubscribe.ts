import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { SubscriptionDispatchOptions } from './dispatch'
import { dispatchSubscription } from './dispatch'

export interface UnsubscribeOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> extends SubscriptionDispatchOptions<TCollection, TCollectionDefaults, TSchema> {}

export async function unsubscribe<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(options: UnsubscribeOptions<TCollection, TCollectionDefaults, TSchema>): Promise<void> {
  return dispatchSubscription('unsubscribe', options)
}
