import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, EngineLayer, KeyId } from './types.js'
import { getPublicKey, registerKey, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'

/** Layer metadata plus public key forms changed during normalization. */
interface NormalizedLayer extends EngineLayer {
  keyFormsChanged: Set<KeyId>
}

/** Find a public layer by id. */
export function getLayerNow(ctx: EngineContext, layerId: string): CacheLayer | undefined {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  return collectionName
    ? ctx.collections.get(collectionName)?.layers.find(entry => entry.layer.id === layerId)?.layer
    : undefined
}

/** Normalize a public layer once so hot reads never coerce its keys again. */
function normalizeLayer(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  layer: CacheLayer,
): NormalizedLayer {
  const patches = new Map<KeyId, any>()
  const deletedItems = new Set<KeyId>()
  const affectedKeys = new Set<KeyId>()
  const keyValues = new Map<KeyId, string | number>()
  const keyFormsChanged = new Set<KeyId>()

  for (const key of Object.keys(layer.state)) {
    const previousKey = state.keyValues.get(toKeyId(key))
    const id = registerKey(state, collection, key, layer.state[key])
    if (previousKey !== undefined && previousKey !== getPublicKey(state, id)) {
      keyFormsChanged.add(id)
    }
    patches.set(id, layer.state[key])
    affectedKeys.add(id)
    keyValues.set(id, getPublicKey(state, id))
  }
  for (const key of layer.deletedItems) {
    const id = toKeyId(key)
    const previousKey = state.keyValues.get(id)
    if (!state.keyValues.has(id)) {
      registerKey(state, collection, key)
    }
    if (previousKey !== undefined && previousKey !== getPublicKey(state, id)) {
      keyFormsChanged.add(id)
    }
    deletedItems.add(id)
    affectedKeys.add(id)
    keyValues.set(id, getPublicKey(state, id))
  }

  return { layer, state: patches, deletedItems, affectedKeys, keyValues, keyFormsChanged }
}

/** Capture resolved values before changing a set of layer inputs. */
function captureResolved(state: EngineCollectionState, keys: Set<KeyId>): Map<KeyId, any | undefined> {
  return new Map(Array.from(keys, id => [id, resolveItemById(state, id)]))
}

/** Reconcile indexes and reactive scopes after a layer transition. */
function reconcileLayerChange(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  state: EngineCollectionState,
  keys: Set<KeyId>,
  previous: Map<KeyId, any | undefined>,
  keyFormsChanged: Set<KeyId> = new Set(),
): void {
  let visibilityChanged = false
  for (const id of keys) {
    invalidateResolvedItem(state, id)
    const next = resolveItemById(state, id)
    const before = previous.get(id)
    reconcileItemIndexes(ctx, collection, id, before, next)
    ctx.observers.touchItem(collection.name, id)
    visibilityChanged ||= Boolean(before) !== Boolean(next)
      || (keyFormsChanged.has(id) && (before !== undefined || next !== undefined))
  }
  if (visibilityChanged) {
    invalidateVisibleKeys(state)
    ctx.observers.touchList(collection.name)
  }
}

/** Add an optimistic layer and update only its effective records. */
export function addLayerNow(ctx: EngineContext, layer: CacheLayer): void {
  const collection = ctx.callbacks.getCollection(layer.collectionName)
  if (!collection) {
    throw new Error(`Collection not found for layer: ${layer.collectionName}`)
  }

  removeLayerNow(ctx, layer.id)

  const state = ctx.ensureCollection(collection.name)
  const entry = normalizeLayer(state, collection, layer)
  const previous = captureResolved(state, entry.affectedKeys)
  const hadNoLayers = state.layers.length === 0
  state.layers = [...state.layers, entry]
  ctx.layerIdToCollection.set(layer.id, collection.name)
  if (hadNoLayers) {
    state.resolvedItems.clear()
  }

  reconcileLayerChange(ctx, collection, state, entry.affectedKeys, previous, entry.keyFormsChanged)
  ctx.callbacks.onLayerAdd?.(layer)
}

/** Remove an optimistic layer and restore its underlying effective records. */
export function removeLayerNow(ctx: EngineContext, layerId: string): void {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  const state = collectionName ? ctx.collections.get(collectionName) : undefined
  const entry = state?.layers.find(candidate => candidate.layer.id === layerId)
  if (!collectionName || !state || !entry) {
    return
  }

  const collection = ctx.callbacks.getCollection(collectionName)
  const previous = captureResolved(state, entry.affectedKeys)
  state.layers = state.layers.filter(candidate => candidate !== entry)
  ctx.layerIdToCollection.delete(layerId)
  if (state.layers.length === 0) {
    state.resolvedItems.clear()
  }

  if (collection) {
    reconcileLayerChange(ctx, collection, state, entry.affectedKeys, previous)
  }
  for (const id of entry.affectedKeys) {
    releaseUnusedKey(state, id)
  }
  ctx.callbacks.onLayerRemove?.(entry.layer)
}
