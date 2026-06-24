import type { Cache, CollectionDefaults, CustomCacheState, ResolvedCollectionItemBase, StoreSchema, WrappedItem } from '@rstore/shared'
import type { CacheRuntime, VueCachePrivate } from './types'
import { gcTombstones, isKeyDefined } from '@rstore/core'
import { ref, toValue } from 'vue'
import { getCollectionIndex, invalidateCollectionStateCache } from './context'
import { ensureLayersForCollection, getStateForCollection } from './layers'
import { applyMutationToCache } from './mutations'
import { enqueueOperation, flushQueuedOperations } from './queue'
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
      return getWrappedItem(ctx, collection, getStateForCollection(ctx, collection.name)[key])
    },
    readItems(params) {
      return readItems(ctx, params)
    },
    writeItem(params) {
      enqueueOperation(ctx, { type: 'writeItem', params })
    },
    writeItems(params) {
      enqueueOperation(ctx, { type: 'writeItems', params, index: 0 })
    },
    writeItemForRelation(params) {
      writeItemForRelation(ctx, params)
    },
    applyMutation(params) {
      return applyMutationToCache(ctx, params)
    },
    deleteItem(params) {
      enqueueOperation(ctx, { type: 'deleteItem', params })
    },
    readFieldTimestamps({ collectionName, key }) {
      return ctx.state.fieldTimestamps.get(collectionName)?.get(key)
    },
    writeFieldTimestamps({ collectionName, key, timestamps }) {
      let collectionTs = ctx.state.fieldTimestamps.get(collectionName)
      if (!collectionTs) {
        collectionTs = new Map()
        ctx.state.fieldTimestamps.set(collectionName, collectionTs)
      }
      collectionTs.set(key, { ...timestamps })
    },
    getModuleState(name, key, initState) {
      const cacheKey = `${name}:${key}`
      if (!ctx.state.modules[cacheKey]) {
        ctx.state.modules[cacheKey] = ref(initState)
      }
      return ctx.state.modules[cacheKey]!.value
    },
    getState() {
      return getState(ctx)
    },
    setState(state) {
      enqueueOperation(ctx, { type: 'setState', state })
    },
    clear() {
      enqueueOperation(ctx, { type: 'clear' })
    },
    clearCollection({ collection }) {
      clearCollection(ctx, collection)
    },
    garbageCollectItem({ collection, item }) {
      garbageCollectItem(ctx, collection, item)
    },
    garbageCollect() {
      garbageCollect(ctx)
    },
    addLayer(layer) {
      enqueueOperation(ctx, { type: 'addLayer', layer })
    },
    getLayer(layerId) {
      const collectionName = ctx.layerIdToCollectionName[layerId]
      if (!collectionName) {
        return undefined
      }
      return ensureLayersForCollection(ctx, collectionName).value.find(l => l.id === layerId)
    },
    removeLayer(layerId) {
      enqueueOperation(ctx, { type: 'removeLayer', layerId })
    },
    tombstones: {
      get: (c, k) => ctx.state.tombstones.get(c, k),
      entries: () => ctx.state.tombstones.entries(),
      size: () => ctx.state.tombstones.size(),
    },
    gcTombstones(olderThan) {
      return gcTombstones(ctx.state.tombstones, olderThan)
    },
    pause() {
      ctx.state.paused = true
    },
    resume() {
      ctx.state.paused = false
      flushQueuedOperations(ctx)
    },
    dispose() {
      ctx.stopTombstoneGc?.()
      ctx.stopTombstoneGc = undefined
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
  if (marker && !ctx.state.markers[marker]) {
    return []
  }
  const data: Record<string | number, ResolvedCollectionItemBase<any, any, any>> = getStateForCollection(ctx, collection.name)
  const result: Array<WrappedItem<any, any, any>> = []
  let count = 0

  if (keys == null && indexKey != null) {
    const index = getCollectionIndex(ctx, collection.name, indexKey)
    const itemKeys = index.get(indexValue)
    keys = itemKeys ? Array.from(itemKeys.value) : []
  }

  for (const key of keys ?? Object.keys(data)) {
    const item = data[key]
    if (!item || (filter && !filter(item))) {
      continue
    }
    const wrappedItem = getWrappedItem(ctx, collection, item)
    if (wrappedItem) {
      result.push(wrappedItem)
      count++
      if (limit != null && count >= limit) {
        break
      }
    }
  }
  return result
}

function writeItemForRelation(ctx: CacheRuntime, { parentCollection, relationKey, relation, childItem, meta }: Parameters<Cache['writeItemForRelation']>[0]) {
  const possibleCollections = Object.keys(relation.to)
  const nestedItemCollection = ctx.getStore().$getCollection(childItem, possibleCollections)
  if (!nestedItemCollection) {
    throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  const nestedKey = nestedItemCollection.getKey(childItem)
  if (!isKeyDefined(nestedKey)) {
    throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  enqueueOperation(ctx, {
    type: 'writeItem',
    params: {
      collection: nestedItemCollection,
      key: nestedKey,
      item: childItem,
      meta,
    },
  })
}

function getState(ctx: CacheRuntime): CustomCacheState {
  const result: CustomCacheState = {
    collections: {},
    markers: toValue(ctx.state.markers),
    modules: {},
    queryMeta: ctx.state.queryMeta,
  }

  for (const collectionName in ctx.state.collections) {
    const targetState: Record<string | number, any> = result.collections[collectionName] = {}
    const itemsForType = ctx.state.collections[collectionName]!.value
    for (const key in itemsForType) {
      const item = itemsForType[key]
      if (item) {
        targetState[key] = toValue(item)
      }
    }
  }

  for (const moduleKey in ctx.state.modules) {
    result.modules[moduleKey] = toValue(ctx.state.modules[moduleKey]!)
  }

  return result
}

function clearCollection(ctx: CacheRuntime, collection: Parameters<Cache['clearCollection']>[0]['collection']) {
  invalidateCollectionStateCache(ctx, collection.name)
  ctx.state.fieldTimestamps.delete(collection.name)
  const tombIds = Array.from(ctx.state.tombstones.entries(), ([, t]) => t)
    .filter(t => t.collection === collection.name)
  for (const t of tombIds) {
    ctx.state.tombstones.clear(t.collection, t.key)
  }
  const itemsForType = ctx.state.collections[collection.name]
  if (!itemsForType) {
    return
  }
  for (const key in itemsForType.value) {
    enqueueOperation(ctx, { type: 'deleteItem', params: { collection, key } })
  }
}

function garbageCollect(ctx: CacheRuntime) {
  for (const collectionName in ctx.state.collections) {
    const collection = ctx.getStore().$collections.find(m => m.name === collectionName)
    if (!collection) {
      continue
    }
    const itemsForType = ctx.state.collections[collectionName]?.value
    if (!itemsForType) {
      continue
    }
    for (const key in itemsForType) {
      const wrappedItem = getWrappedItem(ctx, collection, itemsForType[key])
      if (wrappedItem) {
        garbageCollectItem(ctx, collection, wrappedItem)
      }
    }
  }
}
