import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { shallowRef } from 'vue'
import { wrapItem } from '../item'
import { getItemKey, readRawCacheItem } from './context'

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
      metadata: {
        queries: new Set(),
        dirtyQueries: new Set(),
      },
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
    const metadata = {
      queries: new Set(),
      dirtyQueries: new Set(),
    }
    const cell = ctx.itemCells.create(collection.name, key, current)
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
  knownKey?: string | number,
) {
  if (item.$meta.queries.size !== 0) {
    return
  }
  const key = knownKey ?? getItemKey(collection, item)
  ctx.engine.garbageCollectKey(collection, key)
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
