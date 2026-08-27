import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheRuntime } from './types'
import { shallowRef } from 'vue'
import { wrapItem } from '../item'
import { addWrappedItemKeyToLayer, getItemKey, getItemWrapKey, readRawCacheItem } from './context'

/**
 * Read engine data on every wrapped-field access. Vue effects receive the
 * matching item signal, while plain reads stay fresh without subscriptions.
 */
function createEngineItemSource(
  ctx: CacheRuntime,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
  fallback: any,
): Ref<any> {
  return {
    get value() {
      if (!ctx.signals.trackItem(collection.name, key)) {
        ctx.versions.trackItem(collection.name)
      }
      return readRawCacheItem(ctx, collection, key) ?? fallback
    },
  } as Ref<any>
}

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
      // Layered values can still inherit fields from base state. This source
      // re-reads on field access, so base writes refresh without recreating
      // wrappers and plain non-reactive reads cannot cache stale values.
      item: createEngineItemSource(ctx, collection, key, item),
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
