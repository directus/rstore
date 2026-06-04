import type { CacheLayer } from '@rstore/shared'
import type { EngineContext } from './types.js'
import { resolveItem, updateItemIndexes } from './resolve.js'

/** Find a layer by id across the collection it was registered against. */
export function getLayerNow(ctx: EngineContext, layerId: string): CacheLayer | undefined {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  if (!collectionName) {
    return undefined
  }
  const collectionState = ctx.collections.get(collectionName)
  return collectionState?.layers.find(l => l.id === layerId)
}

/**
 * Touch the item observers for every key a layer affects (inserts, modifies
 * and deletes) plus the collection list, so a layer add/remove re-runs exactly
 * the dependent reactive scopes.
 */
function touchLayerScopes(ctx: EngineContext, layer: CacheLayer): void {
  for (const key of Object.keys(layer.state)) {
    ctx.observers.touchItem(layer.collectionName, key)
  }
  for (const key of layer.deletedItems) {
    ctx.observers.touchItem(layer.collectionName, key)
  }
  ctx.observers.touchList(layer.collectionName)
}

/**
 * Add an optimistic layer to its collection and reconcile relation indexes so
 * that layer-inserted/modified items are findable by relation lookups.
 *
 * An existing layer with the same id is removed first (replace semantics).
 * Index entries are computed against the pre-layer resolved item so the diff
 * is correct, then applied after the layer is in place.
 */
export function addLayerNow(ctx: EngineContext, layer: CacheLayer): void {
  const collection = ctx.callbacks.getCollection(layer.collectionName)
  if (!collection) {
    throw new Error(`Collection not found for layer: ${layer.collectionName}`)
  }

  removeLayerNow(ctx, layer.id)

  // Capture the pre-layer resolved item per affected key for index diffing.
  const queuedIndexUpdates: Array<[string | number, any, any]> = []
  for (const key in layer.state) {
    const existing = resolveItem(ctx, collection.name, key)
    queuedIndexUpdates.push([key, existing, layer.state[key]])
  }

  const collectionState = ctx.ensureCollection(collection.name)
  collectionState.layers = [...collectionState.layers, layer]
  ctx.layerIdToCollection.set(layer.id, layer.collectionName)

  for (const [key, existing, newData] of queuedIndexUpdates) {
    updateItemIndexes(ctx, collection, key, existing, newData)
  }

  touchLayerScopes(ctx, layer)
  ctx.callbacks.onLayerAdd?.(layer)
}

/**
 * Remove a layer and revert the relation indexes its state contributed, so
 * lookups again reflect the underlying base items.
 */
export function removeLayerNow(ctx: EngineContext, layerId: string): void {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  if (!collectionName) {
    return
  }
  const collectionState = ctx.collections.get(collectionName)
  if (!collectionState) {
    return
  }
  const layer = collectionState.layers.find(l => l.id === layerId)
  if (!layer) {
    return
  }

  collectionState.layers = collectionState.layers.filter(l => l.id !== layerId)
  ctx.layerIdToCollection.delete(layerId)

  const collection = ctx.callbacks.getCollection(layer.collectionName)
  if (collection) {
    // With the layer gone, `currentData` is the reverted (base) item; rebuild
    // the pre-removal value to move the index entry back.
    for (const key in layer.state) {
      const currentData = resolveItem(ctx, collection.name, key)
      const previousData = { ...currentData, ...layer.state[key] }
      updateItemIndexes(ctx, collection, key, previousData, currentData)
    }
  }

  touchLayerScopes(ctx, layer)
  ctx.callbacks.onLayerRemove?.(layer)
}
