import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineCollectionState, EngineContext, EngineEffect, EngineLayer, KeyId } from './internal-types.js'
import { recordItem, recordList } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
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

  return { layer, state: patches, deletedItems, affectedKeys, affectedKeyList: [...affectedKeys], keyValues, canonicalKeys }
}

/** Recompute affected public key forms and report exact changes. */
function refreshLayerKeyValues(state: EngineCollectionState, keys: readonly KeyId[]): Set<KeyId> | undefined {
  let changed: Set<KeyId> | undefined
  for (const id of keys) {
    const previous = state.keyValues.get(id)
    refreshPublicKey(state, id)
    if (previous !== undefined && previous !== state.keyValues.get(id)) {
      (changed ??= new Set()).add(id)
    }
  }
  return changed
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
  keyFormsChanged?: ReadonlySet<KeyId>,
): void {
  let visibilityChanged = false
  const hasIndexes = getCollectionMetadata(collection).hasIndexes
  for (let index = 0; index < keys.length; index++) {
    const id = keys[index]!
    invalidateResolvedItem(state, id)
    const next = resolveItemById(state, id)
    const before = previous[index]
    if (before !== next) {
      if (hasIndexes)
        reconcileItemIndexes(ctx, changes, collection, id, next)
      recordItem(changes, collection.name, id, next)
    }
    visibilityChanged ||= (before !== undefined) !== (next !== undefined)
      || (Boolean(keyFormsChanged?.has(id)) && (before !== undefined || next !== undefined))
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
  const previous = captureResolved(state, entry.affectedKeyList)
  const hadNoLayers = state.layers.length === 0
  state.layers.push(entry)
  ctx.layerIdToCollection.set(layer.id, collection.name)
  const keyFormsChanged = refreshLayerKeyValues(state, entry.affectedKeyList)
  if (hadNoLayers) {
    state.resolvedItems.clear()
  }

  reconcileLayerChange(ctx, changes, collection, state, entry.affectedKeyList, previous, keyFormsChanged)
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
  const previous = captureResolved(state, entry.affectedKeyList)
  state.layers.splice(state.layers.indexOf(entry), 1)
  ctx.layerIdToCollection.delete(layerId)
  const keyFormsChanged = refreshLayerKeyValues(state, entry.affectedKeyList)
  if (state.layers.length === 0) {
    state.resolvedItems.clear()
  }

  if (collection) {
    reconcileLayerChange(ctx, changes, collection, state, entry.affectedKeyList, previous, keyFormsChanged)
  }
  for (const id of entry.affectedKeys) {
    releaseUnusedKey(state, id)
  }
  return [{ type: 'layerRemove', layer: entry.layer }]
}
