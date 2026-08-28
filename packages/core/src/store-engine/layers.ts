import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineCollectionState, EngineContext, EngineEffect, EngineLayer, KeyId } from './internal-types.js'
import { recordItem, recordList } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { getPublicKey, isEntityKey, refreshPublicKey, releaseUnusedKey, toKeyId } from './identity.js'
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
  const affectedKeys: KeyId[] = []
  let fallbackKeyValues: Map<KeyId, string | number> | undefined

  for (const key of Object.keys(layer.state)) {
    const item = layer.state[key]
    const id = toKeyId(key)
    const derived = collection.getKey(item)
    patches.set(id, item)
    affectedKeys.push(id)
    if (!isEntityKey(derived) || toKeyId(derived) !== id) {
      fallbackKeyValues ??= new Map()
      fallbackKeyValues.set(id, getPublicKey(state, id) ?? key)
    }
  }
  for (const key of layer.deletedItems) {
    const id = toKeyId(key)
    deletedItems.add(id)
    if (!patches.has(id))
      affectedKeys.push(id)
    fallbackKeyValues ??= new Map()
    fallbackKeyValues.set(id, getPublicKey(state, id) ?? key)
  }

  return { layer, state: patches, deletedItems, affectedKeys, fallbackKeyValues }
}

/** Change active layer ownership counts for one normalized layer. */
function changeLayeredKeyCounts(state: EngineCollectionState, layer: EngineLayer, delta: 1 | -1): void {
  if (layer.layer.skip)
    return
  const counts = state.layeredKeyCounts ?? new Map<KeyId, number>()
  state.layeredKeyCounts = counts
  for (const id of layer.affectedKeys) {
    const next = (counts.get(id) ?? 0) + delta
    if (next > 0)
      counts.set(id, next)
    else counts.delete(id)
  }
  if (!counts.size)
    state.layeredKeyCounts = undefined
}

/** Capture resolved values before changing a set of layer inputs. */
function captureResolved(state: EngineCollectionState, keys: readonly KeyId[]): any[] {
  return keys.map(id => resolveItemById(state, id))
}

/** Reconcile indexes and reactive scopes after a layer transition. */
function reconcileLayerChange(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: ResolvedCollection<any, any, any>,
  state: EngineCollectionState,
  keys: readonly KeyId[],
  previous: readonly any[],
  previousKeys: readonly (string | number)[],
): void {
  let visibilityChanged = false
  const hasIndexes = getCollectionMetadata(collection).hasIndexes
  for (let index = 0; index < keys.length; index++) {
    const id = keys[index]!
    invalidateResolvedItem(state, id)
    const next = resolveItemById(state, id)
    const before = previous[index]
    refreshPublicKey(state, id)
    const keyFormChanged = previousKeys[index] !== getPublicKey(state, id)
    if (before !== next) {
      if (hasIndexes)
        reconcileItemIndexes(ctx, changes, collection, id, before, next)
      recordItem(changes, collection.name, id, next)
    }
    visibilityChanged ||= (before !== undefined) !== (next !== undefined)
      || (keyFormChanged && (before !== undefined || next !== undefined))
  }
  if (visibilityChanged) {
    invalidateVisibleKeys(state)
    recordList(changes, collection.name)
  }
}

/** Add an optimistic layer and update only its effective records. */
export function addLayerNow(ctx: EngineContext, changes: ChangeRecorder | undefined, layer: CacheLayer): EngineEffect[] {
  const collection = ctx.callbacks.getCollection(layer.collectionName)
  if (!collection) {
    throw new Error(`Collection not found for layer: ${layer.collectionName}`)
  }

  const state = ctx.ensureCollection(collection.name)
  // Normalize before replacing a same-id layer so malformed patches cannot
  // remove an already-committed layer as a partial side effect.
  const entry = normalizeLayer(state, collection, layer)
  const effects = removeLayerNow(ctx, changes, layer.id)
  const previous = captureResolved(state, entry.affectedKeys)
  const previousKeys = entry.affectedKeys.map(id => getPublicKey(state, id))
  const hadNoLayers = state.layers.length === 0
  state.layers.push(entry)
  changeLayeredKeyCounts(state, entry, 1)
  ctx.layerIdToCollection.set(layer.id, collection.name)
  if (hadNoLayers) {
    state.resolvedItems.clear()
  }

  reconcileLayerChange(ctx, changes, collection, state, entry.affectedKeys, previous, previousKeys)
  effects.push({ type: 'layerAdd', layer })
  return effects
}

/** Remove an optimistic layer and restore its underlying effective records. */
export function removeLayerNow(ctx: EngineContext, changes: ChangeRecorder | undefined, layerId: string): EngineEffect[] {
  const collectionName = ctx.layerIdToCollection.get(layerId)
  const state = collectionName === undefined ? undefined : ctx.collections.get(collectionName)
  const entry = state?.layers.find(candidate => candidate.layer.id === layerId)
  if (collectionName === undefined || !state || !entry) {
    return []
  }

  const collection = ctx.callbacks.getCollection(collectionName)
  const previous = captureResolved(state, entry.affectedKeys)
  const previousKeys = entry.affectedKeys.map(id => getPublicKey(state, id))
  state.layers.splice(state.layers.indexOf(entry), 1)
  changeLayeredKeyCounts(state, entry, -1)
  ctx.layerIdToCollection.delete(layerId)
  if (state.layers.length === 0) {
    state.resolvedItems.clear()
  }

  if (collection) {
    reconcileLayerChange(ctx, changes, collection, state, entry.affectedKeys, previous, previousKeys)
  }
  for (const id of entry.affectedKeys) {
    releaseUnusedKey(state, id)
  }
  return [{ type: 'layerRemove', layer: entry.layer }]
}

/** Restore active layer ownership counts after snapshot staging. */
export function restoreLayerOwnership(state: EngineCollectionState): void {
  state.layeredKeyCounts = undefined
  for (const layer of state.layers)
    changeLayeredKeyCounts(state, layer, 1)
  const ids = new Set(state.base.keys())
  for (const layer of state.layers) {
    for (const id of layer.affectedKeys)
      ids.add(id)
  }
  for (const id of ids)
    refreshPublicKey(state, id)
}
