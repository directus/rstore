import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { shallowRef } from 'vue'
import { wrapItem } from '../item'
import { createWrappedItemMetadata } from '../itemMetadata'
import { getItemKey, readRawCacheItem } from './context'
import { invalidatePageRefsForItem } from './queryState'

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
  knownKey?: string | number,
  track = false,
): WrappedItem<TCollection, TCollectionDefaults, TSchema> | undefined {
  if (!item) {
    return undefined
  }

  if (noCache) {
    return wrapItem({
      store: ctx.getStore(),
      collection,
      item: shallowRef(item),
      metadata: createWrappedItemMetadata(),
    })
  }

  const key = knownKey ?? getItemKey(collection, item)
  // Public wrapItem calls can carry embedded relation payloads that engine
  // normalized into child rows. Seed cached wrappers from canonical engine
  // state so relation fields keep resolving through indexes.
  const current = knownKey === undefined
    ? readRawCacheItem(ctx, collection, key) ?? item
    : item
  const layer = current.$layer
  let entry = ctx.wrappedItems.get(collection.name, key, layer?.id)
  if (!entry) {
    const metadata = createWrappedItemMetadata()
    const cell = ctx.itemCells.create(collection.name, key, current, track)
    const wrappedItem = wrapItem({
      store: ctx.getStore(),
      collection,
      item: cell.source,
      metadata,
      seed: current,
    })
    entry = { item: wrappedItem, metadata, cell }
    ctx.wrappedItems.set(
      collection.name,
      key,
      layer?.id,
      entry as unknown as Parameters<typeof ctx.wrappedItems.set>[3],
    )
  }
  if (track)
    entry.cell.track()
  return entry.item as WrappedItem<TCollection, TCollectionDefaults, TSchema>
}

/** Delete an unreferenced item from cache and emit garbage collection hooks. */
export function garbageCollectItem<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  item: WrappedItem<TCollection, CollectionDefaults, StoreSchema>,
  knownKey?: string | number,
) {
  if (item.$meta.queries.size !== 0) {
    return
  }
  const key = knownKey ?? getItemKey(collection, item)
  if (!ctx.engine.garbageCollectKey(collection, key)) {
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
