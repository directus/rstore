import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { WrappedItemMetadata } from '../itemMetadata'
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

/**
 * Forget the base wrapper of a row that is not in cache state.
 *
 * Fetches wrap their response rows right away, even when the cache write is
 * still queued (paused cache, staggering). If that write is then dropped or
 * rejected, nothing else would ever remove the wrapper and the raw row it
 * holds. Wrappers still owned by a query are kept, so their ownership
 * survives until the row lands.
 */
export function releaseUnwrittenItem(ctx: CacheRuntime, collection: ResolvedCollection<any, any, any>, key: string | number): void {
  const entry = ctx.wrappedItems.get(collection.name, key)
  if (entry && !isOwned(entry.metadata) && readRawCacheItem(ctx, collection, key) === undefined) {
    ctx.wrappedItems.deleteBase(collection.name, key)
  }
}

/** Forget every unowned base wrapper whose row is not in cache state. */
export function releaseUnwrittenItems(ctx: CacheRuntime): void {
  const collections = new Map(ctx.getStore().$collections.map(collection => [collection.name, collection]))
  ctx.wrappedItems.forEachBase((collectionName, id, entry) => {
    const collection = collections.get(collectionName)
    if (collection && !isOwned(entry.metadata) && readRawCacheItem(ctx, collection, id) === undefined) {
      ctx.wrappedItems.deleteBase(collectionName, id)
    }
  })
}

/** Whether a query still owns, or is reconciling ownership of, a wrapper. */
function isOwned(metadata: WrappedItemMetadata): boolean {
  return metadata.queries.size > 0 || metadata.dirtyQueries.size > 0
}
