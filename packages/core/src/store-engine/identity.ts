import type { ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, KeyId } from './internal-types.js'

/** Convert every public key form into one stable internal identity. */
export function toKeyId(key: string | number): KeyId {
  return String(key)
}

/** Check whether a value is a valid public entity key. */
export function isEntityKey(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

/** Register a base-owned key and recompute its active public representation. */
export function registerBaseKey(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
  item?: any,
): KeyId {
  const derived = item == null ? undefined : collection.getKey(item)
  return registerBaseKeyValue(state, key, derived)
}

/** Register a base-owned key when caller already derived its public form. */
export function registerBaseKeyValue(
  state: EngineCollectionState,
  key: string | number,
  derived?: unknown,
): KeyId {
  const id = toKeyId(key)
  if (isEntityKey(derived) && toKeyId(derived) === id) {
    state.fallbackKeyValues?.delete(id)
    state.publicKeys.set(id, derived)
  }
  else {
    const previous = deriveBaseKey(state, id) ?? state.fallbackKeyValues?.get(id)
    if (previous !== undefined) {
      state.publicKeys.set(id, previous)
    }
    else {
      const values = state.fallbackKeyValues ?? new Map<KeyId, string | number>()
      state.fallbackKeyValues = values
      values.set(id, key)
      state.publicKeys.set(id, key)
    }
  }
  if (state.layers.length)
    refreshPublicKey(state, id)
  return id
}

/** Return the preserved public key form for an internal identity. */
export function getPublicKey(state: EngineCollectionState, id: KeyId, baseCandidate?: any): string | number {
  if (baseCandidate !== undefined && !state.layeredKeyCounts?.has(id))
    return deriveItemKey(state, id, baseCandidate) ?? state.publicKeys.get(id) ?? state.fallbackKeyValues?.get(id) ?? id
  const retained = state.publicKeys.get(id)
  if (retained !== undefined)
    return retained
  if (state.layeredKeyCounts?.has(id)) {
    const layerKey = getLayerPublicKey(state, id, baseCandidate)
    if (layerKey !== undefined)
      return layerKey
  }
  return deriveItemKey(state, id, baseCandidate) ?? deriveBaseKey(state, id) ?? state.fallbackKeyValues?.get(id) ?? id
}

/** Refresh one canonical public key after base or layer ownership changes. */
export function refreshPublicKey(state: EngineCollectionState, id: KeyId): void {
  const next = state.layeredKeyCounts?.has(id)
    ? getLayerPublicKey(state, id)
    : deriveBaseKey(state, id) ?? state.fallbackKeyValues?.get(id)
  if (next === undefined)
    state.publicKeys.delete(id)
  else state.publicKeys.set(id, next)
}

/** Resolve active canonical layers, base data, then layer fallbacks. */
function getLayerPublicKey(state: EngineCollectionState, id: KeyId, baseCandidate?: any): string | number | undefined {
  for (let index = state.layers.length - 1; index >= 0; index--) {
    const layer = state.layers[index]!
    if (!layer.layer.skip && layer.state.has(id)) {
      const derived = deriveItemKey(state, id, layer.state.get(id))
      if (derived !== undefined)
        return derived
    }
  }
  const base = deriveItemKey(state, id, baseCandidate) ?? deriveBaseKey(state, id) ?? state.fallbackKeyValues?.get(id)
  if (base !== undefined)
    return base
  for (const layer of state.layers) {
    if (!layer.layer.skip) {
      const fallback = layer.fallbackKeyValues?.get(id)
      if (fallback !== undefined)
        return fallback
    }
  }
  return undefined
}

/** Drop a representative once no base item or installed layer can expose it. */
export function releaseUnusedKey(state: EngineCollectionState, id: KeyId): void {
  if (state.base.has(id) || state.layers.some(layer => layer.state.has(id) || layer.deletedItems.has(id))) {
    return
  }
  state.fallbackKeyValues?.delete(id)
  state.publicKeys.delete(id)
  if (state.fallbackKeyValues?.size === 0)
    state.fallbackKeyValues = undefined
}

/** Recover one canonical public form from current base data. */
function deriveBaseKey(state: EngineCollectionState, id: KeyId): string | number | undefined {
  return deriveItemKey(state, id, state.base.get(id))
}

/** Recover a valid public key whose canonical identity matches the map id. */
function deriveItemKey(state: EngineCollectionState, id: KeyId, item: any): string | number | undefined {
  if (item == null || !state.collection)
    return undefined
  const derived = state.usesDefaultKey
    ? item.$overrideKey ?? item.id ?? item.__id
    : state.collection.getKey(item)
  return isEntityKey(derived) && toKeyId(derived) === id ? derived : undefined
}
