import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { WrappedItemMetadata } from './itemMetadata'
import type { VueStore } from './store'
import { createPlainItemHandler } from './plainItemHandler'
import { createRichItemHandler } from './richItemHandler'

export type { WrappedItemMetadata } from './itemMetadata'

const richCollections = new WeakMap<object, boolean>()

/** Dependencies used to create one read-only live item proxy. */
export interface WrapItemOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /** Owning Vue store. */
  store: VueStore<TSchema, TCollectionDefaults>
  /** Resolved item collection. */
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  /** Live raw item source. */
  item: Ref<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  /** Query ownership metadata shared with cache GC. */
  metadata: WrappedItemMetadata<TCollection, TCollectionDefaults, TSchema>
  /** Non-reactive snapshot used to seed the extensible proxy facade. */
  seed?: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
}

/** Create a read-only proxy that resolves fields and relations from live state. */
export function wrapItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  collection,
  item,
  metadata,
  seed,
}: WrapItemOptions<TCollection, TCollectionDefaults, TSchema>): WrappedItem<TCollection, TCollectionDefaults, TSchema> {
  // Frozen cache items cannot be direct Proxy targets because later values may
  // violate non-configurable descriptor invariants. Keep an extensible facade.
  const source = seed ?? item.value
  const target = Object.create(Object.getPrototypeOf(source)) as typeof source
  if (!hasRichFields(collection)) {
    return new Proxy(target, createPlainItemHandler({ store, collection, item, metadata })) as WrappedItem<TCollection, TCollectionDefaults, TSchema>
  }

  const handler = createRichItemHandler({ store, collection, item, metadata })
  const proxy = new Proxy(target, handler) as WrappedItem<TCollection, TCollectionDefaults, TSchema>
  handler.attach(proxy)
  return proxy
}

/** Cache immutable schema richness once per resolved collection. */
function hasRichFields(collection: ResolvedCollection<any, any, any>): boolean {
  let rich = richCollections.get(collection)
  if (rich === undefined) {
    rich = Object.keys(collection.computed).length > 0
      || Object.keys(collection.normalizedRelations).length > 0
      || Object.keys(collection.relations).length > 0
    richCollections.set(collection, rich)
  }
  return rich
}
