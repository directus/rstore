import type { EngineAfterWritePayload, EngineCallbacks, EngineConflictPayload } from '@rstore/core'
import type { CacheLayer, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreSchema } from '@rstore/shared'
import type { CacheRuntime, CreateCacheOptions } from './types'
import { createStoreEngine, isKeyDefined } from '@rstore/core'
import { shallowRef } from 'vue'
import { createSignalRegistry } from './signals'

/** Create the mutable runtime shared by all cache modules. */
export function createCacheRuntime<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>({
  getStore,
  cacheStaggering,
  tombstoneGc = {},
  isServer = (import.meta as unknown as { server?: boolean }).server === true,
}: CreateCacheOptions<TSchema, TCollectionDefaults>): CacheRuntime<TSchema, TCollectionDefaults> {
  let runtime: CacheRuntime<TSchema, TCollectionDefaults>
  const pageRefs = new Map<string, any>()

  const callbacks: EngineCallbacks = {
    getCollection: name => getStore().$collections.find(c => c.name === name),

    resolveChildCollection: (item, possibleNames) => getStore().$getCollection(item, possibleNames),

    onAfterWrite: (payload: EngineAfterWritePayload) => {
      if (payload.operation === 'delete' && payload.key != null) {
        evictBaseWrappedItem(runtime, payload.collection, payload.key)
      }
      const store = getStore()
      store.$hooks.callHookSync('afterCacheWrite', {
        store,
        meta: {},
        collection: payload.collection,
        key: payload.key,
        result: payload.result,
        marker: payload.marker,
        operation: payload.operation,
      })
    },

    onConflict: (payload: EngineConflictPayload) => {
      const store = getStore()
      store.$hooks.callHookSync('cacheConflict', {
        store,
        meta: {},
        collection: payload.collection,
        key: payload.key,
        conflicts: payload.conflicts,
      })
    },

    onLayerAdd: (layer) => {
      const ref = ensureLayersForCollection(runtime, layer.collectionName)
      ref.value = [...ref.value.filter(l => l.id !== layer.id), layer]
      runtime.layerIdToCollectionName[layer.id] = layer.collectionName
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerAdd', { store, layer })
    },

    onLayerRemove: (layer) => {
      const ref = runtime.layers[layer.collectionName]
      if (ref) {
        ref.value = ref.value.filter(l => l.id !== layer.id)
      }
      delete runtime.layerIdToCollectionName[layer.id]
      clearLayerWrappedItems(runtime, layer.id)
      const store = getStore()
      store.$hooks.callHookSync('cacheLayerRemove', { store, layer })
    },

    onReset: () => {
      runtime.wrappedItems.clear()
      runtime.wrappedItemsMetadata.clear()
      runtime.wrappedItemKeysPerLayer.clear()
      const store = getStore()
      store.$hooks.callHookSync('afterCacheReset', { store, meta: {} })
    },
  }

  const engine = createStoreEngine({
    callbacks,
    cacheStaggering,
    tombstoneGc,
    isServer,
  })

  runtime = {
    getStore,
    engine,
    state: {
      pageRefs,
      get queryMeta() {
        return engine._getQueryMeta()
      },
    },
    signals: createSignalRegistry({ engine, isServer }),
    layers: {},
    layerIdToCollectionName: {},
    wrappedItems: new Map(),
    wrappedItemsMetadata: new Map(),
    wrappedItemKeysPerLayer: new Map(),
  }

  return runtime
}

/** Build the cache key for a wrapped item proxy. */
export function getItemWrapKey(collection: ResolvedCollection<any, any, any>, key: string | number, layer: { id: string } | undefined) {
  return [layer?.id, collection.name, key].filter(Boolean).join(':')
}

/** Resolve an item primary key or throw a cache-friendly error. */
export function getItemKey(collection: ResolvedCollection<any, any, any>, item: ResolvedCollectionItem<any, any, any>): string | number {
  const key = collection.getKey(item)
  if (!isKeyDefined(key)) {
    throw new Error(`Item does not have a key for collection ${collection.name}: ${item}`)
  }
  return key
}

/** Track a wrapped item key so layer removal can evict its proxy. */
export function addWrappedItemKeyToLayer(ctx: CacheRuntime, layer: { id: string } | undefined, wrapKey: string) {
  if (!layer) {
    return
  }
  let keys = ctx.wrappedItemKeysPerLayer.get(layer.id)
  if (!keys) {
    keys = new Set()
    ctx.wrappedItemKeysPerLayer.set(layer.id, keys)
  }
  keys.add(wrapKey)
}

/** Ensure the devtools layer mirror for a collection exists. */
export function ensureLayersForCollection(ctx: CacheRuntime, collectionName: string) {
  return ctx.layers[collectionName] ??= shallowRef<CacheLayer[]>([])
}

/** Drop a wrapped base item and its metadata from the identity maps. */
export function evictBaseWrappedItem(ctx: CacheRuntime, collection: ResolvedCollection<any, any, any>, key: string | number) {
  const wrapKey = getItemWrapKey(collection, key, undefined)
  ctx.wrappedItems.delete(wrapKey)
  ctx.wrappedItemsMetadata.delete(wrapKey)
}

function clearLayerWrappedItems(ctx: CacheRuntime, layerId: string) {
  const keys = ctx.wrappedItemKeysPerLayer.get(layerId)
  if (!keys) {
    return
  }
  for (const wrapKey of keys) {
    ctx.wrappedItems.delete(wrapKey)
    ctx.wrappedItemsMetadata.delete(wrapKey)
  }
  ctx.wrappedItemKeysPerLayer.delete(layerId)
}
