import type { EngineCollectionState, EngineContext, EngineLayer, KeyId } from './types.js'
import { getPublicKey, toKeyId } from './identity.js'

/** Distinguish cached missing values from an uncached `Map#get` result. */
const MISSING_RESOLVED_ITEM = Symbol('missing-resolved-item')

/** Check whether an installed layer currently participates in resolution. */
export function isLayerActive(layer: EngineLayer): boolean {
  return !layer.layer.skip
}

/** Clear a cached resolved item after one of its inputs changed. */
export function invalidateResolvedItem(state: EngineCollectionState, id: KeyId): void {
  state.resolvedItems.delete(id)
}

/** Clear the lazily materialized visible key order. */
export function invalidateVisibleKeys(state: EngineCollectionState): void {
  state.visibleKeys = undefined
  state.visibleKeyValues = undefined
}

/** Resolve one item from base data plus all active layers. */
export function resolveItemById(state: EngineCollectionState, id: KeyId): any | undefined {
  if (state.layers.length === 0) {
    return state.base.get(id)
  }
  const cached = state.resolvedItems.get(id)
  if (cached !== undefined) {
    return cached === MISSING_RESOLVED_ITEM ? undefined : cached
  }

  let result = state.base.get(id)
  for (const layer of state.layers) {
    if (isLayerActive(layer) && layer.state.has(id)) {
      result = {
        ...result,
        ...layer.state.get(id),
        $layer: layer.layer,
      }
    }
  }
  for (const layer of state.layers) {
    if (isLayerActive(layer) && layer.deletedItems.has(id)) {
      result = undefined
      break
    }
  }

  state.resolvedItems.set(id, result === undefined ? MISSING_RESOLVED_ITEM : result)
  return result
}

/** Resolve one public key from a named collection. */
export function resolveItem(ctx: EngineContext, collectionName: string, key: string | number): any | undefined {
  const state = ctx.collections.get(collectionName)
  return state ? resolveItemById(state, toKeyId(key)) : undefined
}

/** Return visible identities in base-then-layer insertion order. */
export function getVisibleKeyIds(state: EngineCollectionState): KeyId[] {
  if (state.visibleKeys) {
    return state.visibleKeys
  }

  const keys = new Set<KeyId>(state.base.keys())
  for (const layer of state.layers) {
    if (isLayerActive(layer)) {
      for (const id of layer.state.keys()) {
        keys.add(id)
      }
    }
  }
  for (const layer of state.layers) {
    if (isLayerActive(layer)) {
      for (const id of layer.deletedItems) {
        keys.delete(id)
      }
    }
  }

  state.visibleKeys = Array.from(keys)
  return state.visibleKeys
}

/** Return visible public keys for one collection. */
export function getVisibleKeys(ctx: EngineContext, collectionName: string): Array<string | number> {
  const state = ctx.collections.get(collectionName)
  if (!state) {
    return []
  }
  state.visibleKeyValues ??= getVisibleKeyIds(state).map(id => getPublicKey(state, id))
  // Public callers have always received a new array, so keep cache ownership
  // internal while avoiding repeated `Map#get` conversions on hot list reads.
  return state.visibleKeyValues.slice()
}
