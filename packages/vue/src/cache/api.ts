import type { Cache, CollectionDefaults, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime, VueCachePrivate } from './types'
import { reactive } from 'vue'
import { ensureLayersForCollection, readRawCacheItem } from './context'
import { applyMutationToCache } from './mutations'
import { garbageCollectItem, getWrappedItem } from './wrapped'

type VisibleListResult = Array<WrappedItem<any, any, any>> & { marker?: string }

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
      const cached = ctx.layers[collection.name] === undefined
        ? ctx.wrappedItems.get(collection.name, key)
        : undefined
      if (cached?.cell.isActive()) {
        cached.cell.track()
        return cached.item
      }
      const raw = readRawCacheItem(ctx, collection, key)
      if (!raw) {
        if (!ctx.signals.trackItem(collection.name, key))
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
  ctx.indexResultCache.dispose()
  ctx.itemCells.dispose()
  ctx.changeInterest.dispose()
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

function readItems(ctx: CacheRuntime, params: Parameters<Cache['readItems']>[0]) {
  const { collection, marker, filter, keys, limit, indexKey } = params
  const visibleList = keys == null && indexKey == null && !filter && limit == null
  if (visibleList) {
    if (!ctx.signals.trackList(collection.name))
      ctx.versions.trackList(collection.name)
    const cached = ctx.visibleListCache.get(collection.name) as VisibleListResult | undefined
    if (cached && (marker === undefined || cached.marker === marker))
      return cached.slice()
    if (marker !== undefined && !ctx.engine.hasMarker(marker))
      return []
    if (cached) {
      cached.marker = marker
      return cached.slice()
    }
    return scanItems(ctx, params, true, true)
  }
  return readUncachedItems(ctx, params)
}

/** Resolve list/index reads that cannot use collection membership cache. */
function readUncachedItems(ctx: CacheRuntime, params: Parameters<Cache['readItems']>[0]) {
  if (params.keys != null || params.indexKey == null) {
    trackList(ctx, params.collection.name)
  }

  const markerActive = params.marker === undefined || ctx.engine.hasMarker(params.marker)
  return scanItems(ctx, params, markerActive, false)
}

/** Track list dependency through lifecycle or ownerless fallback. */
function trackList(ctx: CacheRuntime, collection: string): void {
  if (!ctx.signals.trackList(collection))
    ctx.versions.trackList(collection)
}

/** Materialize uncached list/index results outside hot cached-list function. */
function scanItems(
  ctx: CacheRuntime,
  { collection, marker, filter, keys, limit, indexKey, indexValue }: Parameters<Cache['readItems']>[0],
  markerActive: boolean,
  canReuseVisibleList: boolean,
) {
  let indexDependency: string | undefined
  const canReuseIndex = keys == null && indexKey != null && !filter && limit == null
  let cachedIndex: readonly any[] | undefined
  const result: VisibleListResult = []
  let count = 0
  ctx.engine.scanItemsRaw(
    { collection, marker, keys, indexKey, indexValue },
    (key, raw) => {
      const wrappedItem = getWrappedItem(ctx, collection, raw, false, key)
      if (!wrappedItem || (filter && !filter(wrappedItem)))
        return
      result.push(wrappedItem)
      count++
      if (limit != null && count >= limit)
        return false
    },
    (dependency) => {
      indexDependency = dependency
      if (!ctx.signals.trackIndex(collection.name, dependency))
        ctx.versions.trackIndex(collection.name, dependency)
      if (markerActive && canReuseIndex) {
        cachedIndex = ctx.indexResultCache.get(dependency)
        if (cachedIndex)
          return false
      }
    },
  )
  if (cachedIndex)
    return cachedIndex.slice()
  if (!markerActive)
    return []
  if (canReuseVisibleList) {
    result.marker = marker
    ctx.visibleListCache.set(collection.name, result)
    return result.slice()
  }
  if (canReuseIndex && indexDependency !== undefined) {
    return ctx.indexResultCache.set(collection.name, indexDependency, result)
      ? result.slice()
      : result
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
