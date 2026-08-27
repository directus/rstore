import type { Cache, CollectionDefaults, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime, VueCachePrivate } from './types'
import { reactive } from 'vue'
import { ensureLayersForCollection, readRawCacheItem } from './context'
import { applyMutationToCache } from './mutations'
import { garbageCollectItem, getWrappedItem } from './wrapped'

/** Create the public Cache implementation from a cache runtime. */
export function createCacheApi<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(ctx: CacheRuntime<TSchema, TCollectionDefaults>): Cache & VueCachePrivate {
  return {
    wrapItem({ collection, item, noCache }) {
      return getWrappedItem(ctx, collection, item, noCache)!
    },
    readItem({ collection, key }) {
      const raw = readRawCacheItem(ctx, collection, key)
      if (!raw) {
        ctx.versions.trackItem(collection.name)
        return undefined
      }
      return getWrappedItem(ctx, collection, raw, false, key, true)
    },
    readItems(params) {
      return readItems(ctx, params)
    },
    writeItem(params) {
      ctx.engine.writeItem(params)
    },
    writeItems(params) {
      ctx.engine.writeItems(params)
    },
    writeItemForRelation(params) {
      ctx.engine.writeItemForRelation(params)
    },
    applyMutation(params) {
      return applyMutationToCache(ctx, params)
    },
    deleteItem(params) {
      ctx.engine.deleteItem(params)
    },
    readFieldTimestamps(params) {
      return ctx.engine.readFieldTimestamps(params)
    },
    writeFieldTimestamps(params) {
      ctx.engine.writeFieldTimestamps(params)
    },
    getModuleState(name, key, initState) {
      return reactive(ctx.engine.getModuleState(name, key, initState))
    },
    getState() {
      return ctx.engine.getState()
    },
    setState(state) {
      ctx.engine.setState(state)
    },
    clear() {
      ctx.engine.clear()
    },
    clearCollection(params) {
      ctx.engine.clearCollection(params)
    },
    garbageCollectItem({ collection, item }) {
      garbageCollectItem(ctx, collection, item)
    },
    garbageCollect() {
      garbageCollect(ctx)
    },
    addLayer(layer) {
      ctx.engine.addLayer(layer)
    },
    getLayer(layerId) {
      return ctx.engine.getLayer(layerId)
    },
    removeLayer(layerId) {
      ctx.engine.removeLayer(layerId)
    },
    tombstones: {
      get: (c, k) => ctx.engine.tombstones.get(c, k),
      entries: () => ctx.engine.tombstones.entries(),
      size: () => ctx.engine.tombstones.size(),
    },
    gcTombstones(olderThan) {
      return ctx.engine.gcTombstones(olderThan)
    },
    pause() {
      ctx.engine.pause()
    },
    resume() {
      ctx.engine.resume()
    },
    dispose() {
      disposeCacheRuntime(ctx)
    },
    _private: {
      state: ctx.state,
      getWrappedItem: (collection, item, noCache) => getWrappedItem(ctx, collection, item, noCache),
      layers: ctx.layers,
      ensureLayersForCollection: collectionName => ensureLayersForCollection(ctx, collectionName),
    },
  } satisfies Cache & VueCachePrivate as any
}

/** Release every bridge-owned registry without invoking reset hooks. */
function disposeCacheRuntime(ctx: CacheRuntime): void {
  ctx.engine.dispose()
  ctx.signals.dispose()
  ctx.versions.dispose()
  ctx.visibleListCache.clear()
  ctx.itemCells.dispose()
  ctx.wrappedItems.clear()
  ctx.state.pageRefs.clear()
  for (const key of Object.keys(ctx.state.queryMeta)) {
    delete ctx.state.queryMeta[key]
  }
  for (const collectionName of Object.keys(ctx.layers)) {
    ctx.layers[collectionName]!.value = []
    delete ctx.layers[collectionName]
  }
}

function readItems(ctx: CacheRuntime, { collection, marker, filter, keys, limit, indexKey, indexValue }: Parameters<Cache['readItems']>[0]) {
  if (keys == null && indexKey != null) {
    const dependency = ctx.engine.getIndexDependencyId(collection.name, indexKey, indexValue)
    if (!ctx.signals.trackIndex(dependency)) {
      ctx.versions.trackIndex(dependency)
    }
  }
  else {
    if (!ctx.signals.trackList(collection.name)) {
      ctx.versions.trackList(collection.name)
    }
  }

  if (marker !== undefined && !ctx.engine.hasMarker(marker)) {
    return []
  }

  const canReuseVisibleList = keys == null && indexKey == null && !filter && limit == null
  if (canReuseVisibleList) {
    const cached = ctx.visibleListCache.get(collection.name)
    if (cached) {
      // Keep cache-owned ordering private. Callers have always received a
      // mutable result array, so a local copy preserves that contract.
      return cached.slice()
    }
  }

  const candidateKeys = ctx.engine.resolveKeys({ collection, marker, keys, indexKey, indexValue })
  const result: Array<WrappedItem<any, any, any>> = []
  let count = 0
  for (const key of candidateKeys) {
    const wrappedItem = getWrappedItem(ctx, collection, readRawCacheItem(ctx, collection, key), false, key)
    if (!wrappedItem || (filter && !filter(wrappedItem))) {
      continue
    }
    result.push(wrappedItem)
    count++
    if (limit != null && count >= limit) {
      break
    }
  }
  if (canReuseVisibleList) {
    ctx.visibleListCache.set(collection.name, result)
    return result.slice()
  }
  return result
}

function garbageCollect(ctx: CacheRuntime) {
  const store = ctx.getStore()
  for (const collection of store.$collections) {
    ctx.engine.forEachKey(collection.name, (key) => {
      const wrappedItem = getWrappedItem(ctx, collection, readRawCacheItem(ctx, collection, key), false, key)
      if (wrappedItem) {
        garbageCollectItem(ctx, collection, wrappedItem, key)
      }
    })
  }
}
