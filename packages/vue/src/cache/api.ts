import type { Cache, CollectionDefaults, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime, VueCachePrivate } from './types'
import { reactive } from 'vue'
import { ensureLayersForCollection } from './context'
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
      ctx.signals.trackItem(collection.name, key)
      return getWrappedItem(ctx, collection, ctx.engine.readItemRaw({ collection, key }))
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
      ctx.engine.dispose()
      ctx.signals.dispose()
    },
    _private: {
      state: ctx.state,
      wrappedItems: ctx.wrappedItems,
      wrappedItemsMetadata: ctx.wrappedItemsMetadata,
      getWrappedItem: (collection, item, noCache) => getWrappedItem(ctx, collection, item, noCache),
      layers: ctx.layers,
      ensureLayersForCollection: collectionName => ensureLayersForCollection(ctx, collectionName),
    },
  } satisfies Cache & VueCachePrivate as any
}

function readItems(ctx: CacheRuntime, { collection, marker, filter, keys, limit, indexKey, indexValue }: Parameters<Cache['readItems']>[0]) {
  if (keys == null && indexKey != null) {
    ctx.signals.trackIndex(collection.name, indexKey, String(indexValue))
  }
  else {
    ctx.signals.trackList(collection.name)
  }

  if (marker && !ctx.engine.hasMarker(marker)) {
    return []
  }

  const candidateKeys = ctx.engine.resolveKeys({ collection, marker, keys, indexKey, indexValue })
  const result: Array<WrappedItem<any, any, any>> = []
  let count = 0
  for (const key of candidateKeys) {
    const wrappedItem = getWrappedItem(ctx, collection, ctx.engine.readItemRaw({ collection, key }))
    if (!wrappedItem || (filter && !filter(wrappedItem))) {
      continue
    }
    result.push(wrappedItem)
    count++
    if (limit != null && count >= limit) {
      break
    }
  }
  return result
}

function garbageCollect(ctx: CacheRuntime) {
  const store = ctx.getStore()
  for (const collection of store.$collections) {
    ctx.engine.forEachKey(collection.name, (key) => {
      const wrappedItem = getWrappedItem(ctx, collection, ctx.engine.readItemRaw({ collection, key }))
      if (wrappedItem) {
        garbageCollectItem(ctx, collection, wrappedItem)
      }
    })
  }
}
