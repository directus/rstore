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
  const id = toKeyId(key)
  const derived = item == null ? undefined : collection.getKey(item)
  if (isEntityKey(derived) && toKeyId(derived) === id) {
    state.baseKeyValues.set(id, derived)
  }
  else if (!state.baseKeyValues.has(id)) {
    state.baseKeyValues.set(id, key)
  }
  refreshPublicKey(state, id)
  return id
}

/** Return the preserved public key form for an internal identity. */
export function getPublicKey(state: EngineCollectionState, id: KeyId): string | number {
  return state.keyValues.get(id) ?? id
}

/** Recompute public key representations after restoring base and layers. */
export function restoreLayerKeyValues(state: EngineCollectionState): void {
  const ids = new Set<KeyId>(state.baseKeyValues.keys())
  for (const layer of state.layers) {
    for (const id of layer.affectedKeys) {
      ids.add(id)
    }
  }
  for (const id of ids) {
    refreshPublicKey(state, id)
  }
}

/** Recompute one key from active canonical layers, base, then layer fallback. */
export function refreshPublicKey(state: EngineCollectionState, id: KeyId): void {
  let next: string | number | undefined
  for (let index = state.layers.length - 1; index >= 0; index--) {
    const layer = state.layers[index]!
    if (!layer.layer.skip && layer.canonicalKeys.has(id)) {
      next = layer.keyValues.get(id)
      break
    }
  }
  next ??= state.baseKeyValues.get(id)
  if (next === undefined) {
    for (const layer of state.layers) {
      if (!layer.layer.skip && layer.keyValues.has(id)) {
        next = layer.keyValues.get(id)
        break
      }
    }
  }
  if (next === undefined) {
    state.keyValues.delete(id)
  }
  else {
    state.keyValues.set(id, next)
  }
}

/** Drop a representative once no base item or installed layer can expose it. */
export function releaseUnusedKey(state: EngineCollectionState, id: KeyId): void {
  if (state.base.has(id) || state.layers.some(layer => layer.affectedKeys.has(id))) {
    return
  }
  state.baseKeyValues.delete(id)
  state.keyValues.delete(id)
}
