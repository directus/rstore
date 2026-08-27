import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, EngineEffect, EngineLayer, KeyId } from './internal-types.js'
import { isEntityKey, refreshPublicKey, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'

/** Find a public layer by id. */
export function getLayerNow(ctx: EngineContext, layerId: string): CacheLayer | undefined {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  return collectionName !== undefined
    ? ctx.collections.get(collectionName)?.layers.find(entry => entry.layer.id === layerId)?.layer
    : undefined
}

/** Normalize a public layer once so hot reads never coerce its keys again. */
function normalizeLayer(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  layer: CacheLayer,
): EngineLayer {
  const patches = new Map<KeyId, any>()
  const deletedItems = new Set<KeyId>()
  const affectedKeys = new Set<KeyId>()
  const keyValues = new Map<KeyId, string | number>()
  const canonicalKeys = new Set<KeyId>()

  for (const key of Object.keys(layer.state)) {
    const item = layer.state[key]
    const id = toKeyId(key)
    const derived = collection.getKey(item)
    let publicKey: string | number = state.keyValues.get(id) ?? key
    if (isEntityKey(derived) && toKeyId(derived) === id) {
      publicKey = derived
      canonicalKeys.add(id)
    }
    patches.set(id, item)
    affectedKeys.add(id)
    keyValues.set(id, publicKey)
  }
  for (const key of layer.deletedItems) {
    const id = toKeyId(key)
    deletedItems.add(id)
    affectedKeys.add(id)
    keyValues.set(id, state.keyValues.get(id) ?? key)
  }

  return { layer, state: patches, deletedItems, affectedKeys, keyValues, canonicalKeys }
}

/** Recompute affected public key forms and report exact changes. */
function refreshLayerKeyValues(state: EngineCollectionState, keys: Set<KeyId>): Set<KeyId> {
  const changed = new Set<KeyId>()
  for (const id of keys) {
    const previous = state.keyValues.get(id)
    refreshPublicKey(state, id)
    if (previous !== undefined && previous !== state.keyValues.get(id)) {
      changed.add(id)
    }
  }
  return changed
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
    if (before !== next) {
      reconcileItemIndexes(ctx, collection, id, before, next)
      ctx.observers.touchItem(collection.name, id)
    }
    visibilityChanged ||= (before !== undefined) !== (next !== undefined)
      || (keyFormsChanged.has(id) && (before !== undefined || next !== undefined))
  }
  if (visibilityChanged) {
    invalidateVisibleKeys(state)
    ctx.observers.touchList(collection.name)
  }
}

/** Add an optimistic layer and update only its effective records. */
export function addLayerNow(ctx: EngineContext, layer: CacheLayer): EngineEffect[] {
  const collection = ctx.callbacks.getCollection(layer.collectionName)
  if (!collection) {
    throw new Error(`Collection not found for layer: ${layer.collectionName}`)
  }

  const state = ctx.ensureCollection(collection.name)
  // Normalize before replacing a same-id layer so malformed patches cannot
  // remove an already-committed layer as a partial side effect.
  const entry = normalizeLayer(state, collection, layer)
  const effects = removeLayerNow(ctx, layer.id)
  const previous = captureResolved(state, entry.affectedKeys)
  const hadNoLayers = state.layers.length === 0
  state.layers = [...state.layers, entry]
  ctx.layerIdToCollection.set(layer.id, collection.name)
  const keyFormsChanged = refreshLayerKeyValues(state, entry.affectedKeys)
  if (hadNoLayers) {
    state.resolvedItems.clear()
  }

  reconcileLayerChange(ctx, collection, state, entry.affectedKeys, previous, keyFormsChanged)
  effects.push({ type: 'layerAdd', layer })
  return effects
}

/** Remove an optimistic layer and restore its underlying effective records. */
export function removeLayerNow(ctx: EngineContext, layerId: string): EngineEffect[] {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  const state = collectionName === undefined ? undefined : ctx.collections.get(collectionName)
  const entry = state?.layers.find(candidate => candidate.layer.id === layerId)
  if (collectionName === undefined || !state || !entry) {
    return []
  }

  const collection = ctx.callbacks.getCollection(collectionName)
  const previous = captureResolved(state, entry.affectedKeys)
  state.layers = state.layers.filter(candidate => candidate !== entry)
  ctx.layerIdToCollection.delete(layerId)
  const keyFormsChanged = refreshLayerKeyValues(state, entry.affectedKeys)
  if (state.layers.length === 0) {
    state.resolvedItems.clear()
  }

  if (collection) {
    reconcileLayerChange(ctx, collection, state, entry.affectedKeys, previous, keyFormsChanged)
  }
  for (const id of entry.affectedKeys) {
    releaseUnusedKey(state, id)
  }
  return [{ type: 'layerRemove', layer: entry.layer }]
}
