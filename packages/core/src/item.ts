import type { Collection, CollectionDefaults, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'

export function unwrapItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  wrappedItem: WrappedItem<TCollection, TCollectionDefaults, TSchema>,
): ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> {
  const raw = wrappedItem.$raw
  return raw ? raw() : wrappedItem
}
