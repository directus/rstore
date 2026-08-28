import type { EngineCollectionState, KeyId } from './internal-types.js'

/** Convert every public key form into one stable internal identity. */
export function toKeyId(key: string | number): KeyId {
  return String(key)
}

/** Check whether a value is a valid public entity key. */
export function isEntityKey(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

/** Check one public key against canonical internal identity. */
export function matchesKeyId(value: unknown, id: KeyId): value is string | number {
  return isEntityKey(value) && toKeyId(value) === id
}

/** Register a base-owned key when caller already derived its public form. */
export function registerBaseKeyValue(
  state: EngineCollectionState,
  key: string | number,
  derived?: unknown,
  keyFieldWritten = false,
): KeyId {
  const id = toKeyId(key)
  if (matchesKeyId(derived, id)) {
    clearKeyOverride(state, id)
  }
  else {
    const previous = deriveBaseKey(state, id) ?? state.keyOverrides?.get(id)
    if (previous === undefined || keyFieldWritten) {
      const values = state.keyOverrides ?? new Map<KeyId, string | number>()
      state.keyOverrides = values
      values.set(id, previous ?? key)
    }
  }
  return id
}

/** Remove one sparse key form and eagerly release its empty map. */
export function clearKeyOverride(state: EngineCollectionState, id: KeyId): void {
  state.keyOverrides?.delete(id)
  if (state.keyOverrides?.size === 0)
    state.keyOverrides = undefined
}

/** Return the preserved public key form for an internal identity. */
export function getPublicKey(state: EngineCollectionState, id: KeyId, baseCandidate?: any): string | number {
  if (!state.layeredKeyCounts?.has(id)) {
    const override = state.keyOverrides?.get(id)
    if (override !== undefined)
      return override
    const item = baseCandidate === undefined ? state.base.get(id) : baseCandidate
    return readItemKey(state, item) ?? id
  }
  const layerKey = getLayerPublicKey(state, id, baseCandidate)
  if (layerKey !== undefined)
    return layerKey
  return state.keyOverrides?.get(id) ?? id
}

/** Resolve active canonical layers, base data, then layer fallbacks. */
function getLayerPublicKey(state: EngineCollectionState, id: KeyId, baseCandidate?: any): string | number | undefined {
  for (let index = state.layers.length - 1; index >= 0; index--) {
    const layer = state.layers[index]!
    if (!layer.layer.skip && Object.hasOwn(layer.state, id)) {
      const derived = deriveItemKey(state, id, layer.state[id])
      if (derived !== undefined)
        return derived
    }
  }
  const base = deriveItemKey(state, id, baseCandidate) ?? deriveBaseKey(state, id) ?? state.keyOverrides?.get(id)
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
  if (state.base.has(id) || state.layers.some(layer => Object.hasOwn(layer.state, id) || layer.deletedItems.has(id))) {
    return
  }
  clearKeyOverride(state, id)
}

/** Recover one canonical public form from current base data. */
function deriveBaseKey(state: EngineCollectionState, id: KeyId): string | number | undefined {
  return deriveItemKey(state, id, state.base.get(id))
}

/** Recover a valid public key whose canonical identity matches the map id. */
function deriveItemKey(state: EngineCollectionState, id: KeyId, item: any): string | number | undefined {
  const derived = readItemKey(state, item)
  if (typeof derived === 'string')
    return derived === id ? derived : undefined
  return typeof derived === 'number' && String(derived) === id ? derived : undefined
}

/** Read one entity key from current item data without canonical coercion. */
function readItemKey(state: EngineCollectionState, item: any): string | number | undefined {
  if (item == null)
    return undefined
  const derived = state.usesDefaultKey ? item.$overrideKey ?? item.id ?? item.__id : state.collection?.getKey(item)
  return isEntityKey(derived) ? derived : undefined
}
