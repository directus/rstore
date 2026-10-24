import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { computed, shallowRef } from 'vue'
import { wrapItem } from '../item'
import { addWrappedItemKeyToLayer, ensureCollectionRef, getItemKey, getItemWrapKey, releaseUnwrittenItem } from './context'
import { isKeyPinnedByActiveLayer } from './layers'
import { invalidatePageRefsForItem } from './queryState'
import { deleteItemNow } from './writes'

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
      // A layer row is owned by its layer, which outlives this wrapper anyway.
      item: layer ? shallowRef(item) : createCachedRowSource(ctx, collection.name, key, item),
      metadata,
    })
    ctx.wrappedItems.set(wrapKey, wrappedItem)
    addWrappedItemKeyToLayer(ctx, item.$layer, wrapKey)
  }
  return wrappedItem as WrappedItem<TCollection, TCollectionDefaults, TSchema>
}

/**
 * Read a row from cache state, falling back to the last value seen.
 *
 * The initial value is often a raw fetch response, nested relation payloads
 * included. It only serves until the (possibly queued) write lands: from then
 * on the fallback is the latest state row, so holders of an evicted wrapper
 * keep its last cached fields without pinning the response or its children.
 */
function createCachedRowSource(ctx: CacheRuntime, collectionName: string, key: string | number, initial: any) {
  // The computed closes over `fallback` only, which the first state row replaces.
  let fallback = initial
  return computed(() => {
    const row = ensureCollectionRef(ctx, collectionName).value[key]
    if (row) {
      fallback = row
    }
    return fallback
  })
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
  if (isKeyPinnedByActiveLayer(ctx, collection.name, key)) {
    return
  }
  if (!deleteItemNow(ctx, collection, key)) {
    return
  }
  invalidatePageRefsForItem(ctx, collection.name, key)
  const store = ctx.getStore()
  store.$hooks.callHookSync('itemGarbageCollect', {
    store,
    collection,
    item,
    key,
  })
}

/** Forget every unowned committed-row wrapper whose row is not in state. */
export function releaseUnwrittenItems(ctx: CacheRuntime) {
  const layerWrapKeys = new Set<string>()
  for (const keys of ctx.wrappedItemKeysPerLayer.values()) {
    for (const wrapKey of keys) {
      layerWrapKeys.add(wrapKey)
    }
  }
  const collections = ctx.getStore().$collections
  // Map iteration tolerates deleting the current entry.
  for (const [wrapKey, wrappedItem] of ctx.wrappedItems) {
    if (layerWrapKeys.has(wrapKey)) {
      continue
    }
    const collection = collections.find(candidate => candidate.name === wrappedItem.$collection)
    const key = collection?.getKey(wrappedItem)
    if (collection && key != null) {
      releaseUnwrittenItem(ctx, collection, key)
    }
  }
}
