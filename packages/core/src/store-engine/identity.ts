import type { ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, KeyId } from './types.js'

/** Convert every public key form into one stable internal identity. */
export function toKeyId(key: string | number): KeyId {
  return String(key)
}

/** Check whether a value is a valid public entity key. */
export function isEntityKey(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

/** Keep a derived public key when available, otherwise retain the first raw form. */
export function registerKey(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
  item?: any,
): KeyId {
  const id = toKeyId(key)
  const derived = item == null ? undefined : collection.getKey(item)
  if (isEntityKey(derived) && toKeyId(derived) === id) {
    // A partial optimistic patch may arrive before its full base item. Upgrade
    // its fallback key form once the collection can derive the canonical one.
    state.keyValues.set(id, derived)
  }
  else if (!state.keyValues.has(id)) {
    state.keyValues.set(id, key)
  }
  return id
}

/** Return the preserved public key form for an internal identity. */
export function getPublicKey(state: EngineCollectionState, id: KeyId): string | number {
  return state.keyValues.get(id) ?? id
}

/** Restore key representations carried by installed layers after a reset. */
export function restoreLayerKeyValues(state: EngineCollectionState): void {
  for (const layer of state.layers) {
    for (const [id, key] of layer.keyValues) {
      state.keyValues.set(id, state.keyValues.get(id) ?? key)
    }
  }
}

/** Drop a representative once no base item or installed layer can expose it. */
export function releaseUnusedKey(state: EngineCollectionState, id: KeyId): void {
  if (state.base.has(id) || state.layers.some(layer => layer.affectedKeys.has(id))) {
    return
  }
  state.keyValues.delete(id)
}
