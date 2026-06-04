import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { computed, shallowRef } from 'vue'
import { wrapItem } from '../item'
import { addWrappedItemKeyToLayer, getItemKey, getItemWrapKey } from './context'

/** Return the cached wrapped proxy for an item, creating it when needed. */
export function getWrappedItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  ctx: CacheRuntime<TSchema, TCollectionDefaults>,
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
  item: ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema> | null | undefined,
  noCache = false,
): WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined {
  if (!item) {
    return undefined
  }

  if (noCache) {
    return wrapItem({
      store: ctx.getStore(),
      collection,
      item: shallowRef(item),
      metadata: {
        queries: new Set(),
        dirtyQueries: new Set(),
      },
    })
  }

  const key = getItemKey(collection, item)
  const layer = item.$layer
  const wrapKey = getItemWrapKey(collection, key, layer)
  let wrappedItem = ctx.wrappedItems.get(wrapKey)
  if (!wrappedItem) {
    let metadata = ctx.wrappedItemsMetadata.get(wrapKey)
    if (!metadata) {
      metadata = {
        queries: new Set(),
        dirtyQueries: new Set(),
      }
      ctx.wrappedItemsMetadata.set(wrapKey, metadata)
    }
    wrappedItem = wrapItem({
      store: ctx.getStore(),
      collection,
      item: layer
        ? shallowRef(item)
        : computed(() => {
            ctx.signals.trackItem(collection.name, key)
            return ctx.engine.readItemRaw({ collection, key }) ?? item
          }),
      metadata,
      seed: item,
    })
    ctx.wrappedItems.set(wrapKey, wrappedItem)
    addWrappedItemKeyToLayer(ctx, item.$layer, wrapKey)
  }
  return wrappedItem as WrappedItem<TCollection, TCollectionDefaults, TSchema>
}

/** Delete an unreferenced item from cache and emit garbage collection hooks. */
export function garbageCollectItem<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  item: WrappedItem<TCollection, CollectionDefaults, StoreSchema>,
) {
  if (item.$meta.queries.size !== 0) {
    return
  }
  const key = getItemKey(collection, item)
  ctx.engine.garbageCollectKey(collection, key)
  const store = ctx.getStore()
  store.$hooks.callHookSync('itemGarbageCollect', {
    store,
    collection,
    item,
    key,
  })
}
