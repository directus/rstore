import type { CacheLayer } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheRuntime } from './types'
import { shallowRef } from 'vue'
import { ensureCollectionStateCacheReactivityMarker, invalidateCollectionStateCache } from './context'
import { updateItemIndexes } from './indexes'

/** Read a collection state with active non-skipped layers applied. */
export function getStateForCollection(ctx: CacheRuntime, collectionName: string) {
  // eslint-disable-next-line ts/no-unused-expressions
  ensureCollectionStateCacheReactivityMarker(ctx, collectionName).value

  const cached = ctx.collectionStateCache.get(collectionName)
  if (cached) {
    return cached
  }

  let copied = false
  let result = ctx.state.collections[collectionName]?.value ?? {}
  const collectionLayersRef = ctx.layers[collectionName]
  if (collectionLayersRef) {
    const collectionLayers = collectionLayersRef.value
    for (const layer of collectionLayers) {
      if (layer.skip) {
        continue
      }
      if (!copied) {
        result = Object.assign({}, result)
        copied = true
      }
      const layerState: Record<string | number, any> = {}
      for (const [key, value] of Object.entries(layer.state)) {
        layerState[key] = {
          ...result[key],
          ...value,
          $layer: layer,
        }
      }
      Object.assign(result, layerState)
    }

    for (const layer of collectionLayers) {
      if (!layer.skip && layer.deletedItems) {
        if (!copied) {
          result = Object.assign({}, result)
          copied = true
        }
        for (const key of layer.deletedItems) {
          delete result[key]
        }
      }
    }
  }

  ctx.collectionStateCache.set(collectionName, result)
  return result
}

/** Ensure the layer list for a collection exists. */
export function ensureLayersForCollection(ctx: CacheRuntime, collectionName: string): Ref<CacheLayer[]> {
  return ctx.layers[collectionName] ??= shallowRef([])
}

/** Remove a cache layer immediately. */
export function removeLayer(ctx: CacheRuntime, layerId: string) {
  const collectionName = ctx.layerIdToCollectionName[layerId]
  if (!collectionName) {
    return
  }
  const collectionLayersRef = ctx.layers[collectionName]
  if (!collectionLayersRef) {
    return
  }
  const collectionLayers = collectionLayersRef.value
  const index = collectionLayers.findIndex(l => l.id === layerId)
  if (index === -1) {
    return
  }

  const layer = collectionLayers[index]!
  invalidateCollectionStateCache(ctx, layer.collectionName)
  clearLayerWrappedItems(ctx, layer.id)
  collectionLayersRef.value = collectionLayers.filter(l => l.id !== layerId)
  delete ctx.layerIdToCollectionName[layerId]
  updateIndexesAfterLayerRemoval(ctx, layer)

  const store = ctx.getStore()
  store.$hooks.callHookSync('cacheLayerRemove', {
    store,
    layer,
  })
}

/** Add a cache layer immediately. */
export function addLayerNow(ctx: CacheRuntime, layer: CacheLayer) {
  const collection = ctx.getStore().$collections.find(c => c.name === layer.collectionName)
  if (!collection) {
    throw new Error(`Collection not found for layer: ${layer.collectionName}`)
  }

  removeLayer(ctx, layer.id)
  const queuedIndexUpdates: Array<[string | number, any, any]> = []
  for (const key in layer.state) {
    const existing = getStateForCollection(ctx, collection.name)[key]
    const newData = layer.state[key]
    queuedIndexUpdates.push([key, existing, newData])
  }

  const collectionLayersRef = ensureLayersForCollection(ctx, layer.collectionName)
  collectionLayersRef.value = [...collectionLayersRef.value, layer]
  ctx.layerIdToCollectionName[layer.id] = layer.collectionName
  invalidateCollectionStateCache(ctx, layer.collectionName)

  for (const [key, existing, newData] of queuedIndexUpdates) {
    updateItemIndexes(ctx, collection, key, existing, newData)
  }

  const store = ctx.getStore()
  store.$hooks.callHookSync('cacheLayerAdd', {
    store,
    layer,
  })
}

function clearLayerWrappedItems(ctx: CacheRuntime, layerId: string) {
  const keys = ctx.wrappedItemKeysPerLayer.get(layerId)
  if (!keys) {
    return
  }
  for (const key of keys) {
    ctx.wrappedItems.delete(key)
    ctx.wrappedItemsMetadata.delete(key)
  }
  ctx.wrappedItemKeysPerLayer.delete(layerId)
}

function updateIndexesAfterLayerRemoval(ctx: CacheRuntime, layer: CacheLayer) {
  const collection = ctx.getStore().$collections.find(c => c.name === layer.collectionName)
  if (!collection) {
    return
  }
  for (const key in layer.state) {
    const currentData = getStateForCollection(ctx, collection.name)[key]
    const previousData = { ...currentData, ...layer.state[key] }
    updateItemIndexes(ctx, collection, key, previousData, currentData)
  }
}
