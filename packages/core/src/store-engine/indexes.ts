import type { CacheIndexValue, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, EngineIndexState, IndexValueId, KeyId } from './internal-types.js'
import { getPublicKey } from './identity.js'
import { getVisibleKeyIds, resolveItemById } from './view.js'

/** Normalized values and identities for one indexed item. */
interface IndexedValue {
  /** Canonical collision-free bucket id. */
  id: IndexValueId
  /** Legacy delimiter-joined alias. */
  legacy: string
}

/** Normalize complete item fields through intentional `String()` coercion. */
function readIndexedValue(item: any, fields: readonly string[]): IndexedValue | undefined {
  if (!item) {
    return undefined
  }
  const raw = fields.map(field => item[field])
  if (!raw.every(value => value != null)) {
    return undefined
  }
  const values = raw.map(String)
  return {
    id: encodeCanonicalValue(fields.length, values),
    legacy: values.join(':'),
  }
}

/** Encode a scalar or tuple with an explicit shape namespace. */
function encodeCanonicalValue(fieldCount: number, values: readonly string[]): IndexValueId {
  return fieldCount === 1
    ? `scalar:${JSON.stringify(values[0])}`
    : `tuple:${JSON.stringify(values)}`
}

/** Encode a legacy composite observer independently from canonical tuples. */
function encodeLegacyObserver(value: string): IndexValueId {
  return `legacy:${JSON.stringify(value)}`
}

/** Get or create one materialized index. */
function ensureIndex(state: EngineCollectionState, indexKey: string): EngineIndexState {
  let index = state.indexes.get(indexKey)
  if (!index) {
    index = { buckets: new Map(), legacyAliases: new Map() }
    state.indexes.set(indexKey, index)
  }
  return index
}

/** Add one item id and register its legacy composite alias. */
function addIndexKey(index: EngineIndexState, value: IndexedValue, id: KeyId, composite: boolean): void {
  let keys = index.buckets.get(value.id)
  if (!keys) {
    keys = new Set()
    index.buckets.set(value.id, keys)
    if (composite) {
      const aliases = index.legacyAliases.get(value.legacy) ?? new Set<IndexValueId>()
      aliases.add(value.id)
      index.legacyAliases.set(value.legacy, aliases)
    }
  }
  keys.add(id)
}

/** Remove one item id and release an empty bucket's alias. */
function removeIndexKey(index: EngineIndexState, value: IndexedValue, id: KeyId, composite: boolean): boolean {
  const keys = index.buckets.get(value.id)
  if (!keys?.delete(id)) {
    return false
  }
  if (keys.size > 0) {
    return true
  }
  index.buckets.delete(value.id)
  if (composite) {
    const aliases = index.legacyAliases.get(value.legacy)
    aliases?.delete(value.id)
    if (aliases?.size === 0) {
      index.legacyAliases.delete(value.legacy)
    }
  }
  return true
}

/** Touch canonical and legacy observers affected by one bucket. */
function touchIndexedValue(ctx: EngineContext, collection: string, indexKey: string, value: IndexedValue, composite: boolean): void {
  ctx.observers.touchIndex(collection, indexKey, value.id)
  if (composite) {
    ctx.observers.touchIndex(collection, indexKey, encodeLegacyObserver(value.legacy))
  }
}

/** Reconcile indexes against two fully resolved visible values. */
export function reconcileItemIndexes(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  id: KeyId,
  previous: any | undefined,
  next: any | undefined,
): void {
  const state = ctx.ensureCollection(collection.name)
  for (const [indexKey, fields] of collection.indexes) {
    const previousValue = readIndexedValue(previous, fields)
    const nextValue = readIndexedValue(next, fields)
    if (previousValue?.id === nextValue?.id) {
      continue
    }
    const composite = fields.length > 1
    const index = state.indexes.get(indexKey)
    if (previousValue && index && removeIndexKey(index, previousValue, id, composite)) {
      touchIndexedValue(ctx, collection.name, indexKey, previousValue, composite)
      if (index.buckets.size === 0) {
        state.indexes.delete(indexKey)
      }
    }
    if (nextValue) {
      addIndexKey(ensureIndex(state, indexKey), nextValue, id, composite)
      touchIndexedValue(ctx, collection.name, indexKey, nextValue, composite)
    }
  }
}

/** Rebuild indexes from one staged or active collection view. */
export function rebuildIndexes(collection: ResolvedCollection<any, any, any>, state: EngineCollectionState): void {
  state.indexes.clear()
  for (const id of getVisibleKeyIds(state)) {
    const item = resolveItemById(state, id)
    if (!item) {
      continue
    }
    for (const [indexKey, fields] of collection.indexes) {
      const value = readIndexedValue(item, fields)
      if (value) {
        addIndexKey(ensureIndex(state, indexKey), value, id, fields.length > 1)
      }
    }
  }
}

/** Validate and encode a public lookup for direct observer subscription. */
export function getIndexObserverId(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): IndexValueId {
  const fields = collection?.indexes.get(indexKey) ?? [indexKey]
  if (fields.length === 1) {
    if (Array.isArray(indexValue)) {
      throw new TypeError(`Single-field index "${indexKey}" expects a scalar value`)
    }
    return encodeCanonicalValue(1, [String(indexValue)])
  }
  if (Array.isArray(indexValue)) {
    validateTupleLength(collection?.name, indexKey, fields.length, indexValue.length)
    return encodeCanonicalValue(fields.length, indexValue.map(String))
  }
  const legacy = String(indexValue)
  assertLegacyAliasIsUnambiguous(state?.indexes.get(indexKey), collection?.name, indexKey, legacy)
  return encodeLegacyObserver(legacy)
}

/** Return public keys for one canonical or unambiguous legacy bucket. */
export function getIndexBucket(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): ReadonlySet<string | number> | undefined {
  const fields = collection?.indexes.get(indexKey) ?? [indexKey]
  const index = state?.indexes.get(indexKey)
  let valueId: IndexValueId | undefined
  if (fields.length === 1) {
    if (Array.isArray(indexValue)) {
      throw new TypeError(`Single-field index "${indexKey}" expects a scalar value`)
    }
    valueId = encodeCanonicalValue(1, [String(indexValue)])
  }
  else if (Array.isArray(indexValue)) {
    validateTupleLength(collection?.name, indexKey, fields.length, indexValue.length)
    valueId = encodeCanonicalValue(fields.length, indexValue.map(String))
  }
  else {
    const legacy = String(indexValue)
    const aliases = assertLegacyAliasIsUnambiguous(index, collection?.name, indexKey, legacy)
    valueId = aliases?.values().next().value
  }
  const ids = valueId ? index?.buckets.get(valueId) : undefined
  if (!state || !ids?.size) {
    return undefined
  }
  return new Set(Array.from(ids, id => getPublicKey(state, id)))
}

/** Reject a tuple with the wrong index arity. */
function validateTupleLength(collection: string | undefined, indexKey: string, expected: number, actual: number): void {
  if (actual !== expected) {
    throw new TypeError(`Composite index "${collection ?? 'unknown'}.${indexKey}" expects ${expected} values, received ${actual}`)
  }
}

/** Return alias targets or throw when a joined lookup can select two tuples. */
function assertLegacyAliasIsUnambiguous(
  index: EngineIndexState | undefined,
  collection: string | undefined,
  indexKey: string,
  legacy: string,
): Set<IndexValueId> | undefined {
  const aliases = index?.legacyAliases.get(legacy)
  if (aliases && aliases.size > 1) {
    throw new Error(`Ambiguous legacy composite index value "${legacy}" for "${collection ?? 'unknown'}.${indexKey}"; pass a value tuple instead`)
  }
  return aliases
}
