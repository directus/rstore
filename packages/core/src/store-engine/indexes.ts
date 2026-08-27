import type { CacheIndexValue, ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineCollectionState, EngineContext, EngineIndexState, IndexedValue, IndexValueId, KeyId } from './internal-types.js'
import { mayRecordIndex, mayRecordIndexDependency, recordIndex } from './change-recorder.js'
import { getIndexDependencyId } from './change-set.js'
import { getPublicKey } from './identity.js'
import { encodeIndexLookup, encodeLegacyValue, getLiveAliasTargets, readIndexedValue } from './index-value.js'
import { getVisibleKeyIds, resolveItemById } from './view.js'

const EMPTY_BUCKET_SWEEP_THRESHOLD = 256

/** Get or create one materialized index. */
function ensureIndex(state: EngineCollectionState, indexKey: string): EngineIndexState {
  let index = state.indexes.get(indexKey)
  if (!index) {
    index = {
      buckets: new Map(),
      emptyBucketCount: 0,
      legacyAliases: new Map(),
      dependencyIds: new Map(),
      scalarValues: new Map(),
      tupleValues: new Map(),
    }
    state.indexes.set(indexKey, index)
  }
  return index
}

/** Add one item id while reusing retained buckets and alias containers. */
function addIndexKey(index: EngineIndexState, value: IndexedValue, id: KeyId, composite: boolean): void {
  let keys = index.buckets.get(value.id)
  if (!keys) {
    keys = new Set<KeyId>()
    index.buckets.set(value.id, keys)
  }
  else if (!keys.size) {
    index.emptyBucketCount--
  }
  keys.add(id)
  if (composite) {
    const aliases = index.legacyAliases.get(value.legacy) ?? new Set<IndexValueId>()
    index.legacyAliases.set(value.legacy, aliases)
    aliases.add(value.id)
  }
}

/** Remove one membership while retaining its empty storage for hot reuse. */
function removeIndexKey(ctx: EngineContext, index: EngineIndexState, value: IndexedValue, id: KeyId): boolean {
  const keys = index.buckets.get(value.id)
  if (!keys?.delete(id))
    return false
  if (!keys.size) {
    index.emptyBucketCount++
    if (index.emptyBucketCount > EMPTY_BUCKET_SWEEP_THRESHOLD)
      ctx.indexSweepCandidates.add(index)
  }
  return true
}

/** Record exact tuple and legacy joined-string dependency changes. */
function touchIndexedValue(
  changes: ChangeRecorder | undefined,
  collection: string,
  indexKey: string,
  index: EngineIndexState,
  value: IndexedValue,
  composite: boolean,
): void {
  if (!mayRecordIndex(changes, collection))
    return
  addDependency(changes, index, collection, indexKey, value.id)
  if (composite)
    addDependency(changes, index, collection, indexKey, value.legacyId)
}

/** Reuse one opaque dependency string across alternating writes. */
function addDependency(
  changes: ChangeRecorder | undefined,
  index: EngineIndexState,
  collection: string,
  indexKey: string,
  valueId: IndexValueId,
): void {
  let dependency = index.dependencyIds.get(valueId)
  if (!mayRecordIndexDependency(changes, collection, dependency))
    return
  if (!dependency) {
    dependency = getIndexDependencyId(collection, indexKey, valueId)
    index.dependencyIds.set(valueId, dependency)
  }
  recordIndex(changes, collection, dependency)
}

/** Cache one public opaque dependency after a reader or observer requests it. */
export function cacheIndexDependencyId(
  index: EngineIndexState | undefined,
  collection: string,
  indexKey: string,
  valueId: IndexValueId,
): string {
  const cached = index?.dependencyIds.get(valueId)
  if (cached)
    return cached
  const dependency = getIndexDependencyId(collection, indexKey, valueId)
  index?.dependencyIds.set(valueId, dependency)
  return dependency
}

/** Reconcile one item's indexes from cached previous memberships. */
export function reconcileItemIndexes(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: ResolvedCollection<any, any, any>,
  id: KeyId,
  next: any | undefined,
): void {
  const state = ctx.ensureCollection(collection.name)
  const memberships = state.indexMemberships.get(id) ?? new Map<string, IndexedValue>()
  for (const [indexKey, fields] of collection.indexes) {
    const index = ensureIndex(state, indexKey)
    const previousValue = memberships.get(indexKey)
    const nextValue = readIndexedValue(next, fields, index)
    if (previousValue?.id === nextValue?.id)
      continue
    const composite = fields.length > 1
    if (previousValue && removeIndexKey(ctx, index, previousValue, id)) {
      touchIndexedValue(changes, collection.name, indexKey, index, previousValue, composite)
    }
    if (nextValue) {
      addIndexKey(index, nextValue, id, composite)
      memberships.set(indexKey, nextValue)
      touchIndexedValue(changes, collection.name, indexKey, index, nextValue, composite)
    }
    else {
      memberships.delete(indexKey)
    }
  }
  if (memberships.size)
    state.indexMemberships.set(id, memberships)
  else state.indexMemberships.delete(id)
}

/** Rebuild buckets and membership caches from one resolved collection view. */
export function rebuildIndexes(collection: ResolvedCollection<any, any, any>, state: EngineCollectionState): void {
  state.indexes.clear()
  state.indexMemberships.clear()
  for (const id of getVisibleKeyIds(state)) {
    const item = resolveItemById(state, id)
    if (!item)
      continue
    const memberships = new Map<string, IndexedValue>()
    for (const [indexKey, fields] of collection.indexes) {
      const index = ensureIndex(state, indexKey)
      const value = readIndexedValue(item, fields, index)
      if (!value)
        continue
      memberships.set(indexKey, value)
      addIndexKey(index, value, id, fields.length > 1)
    }
    if (memberships.size)
      state.indexMemberships.set(id, memberships)
  }
}

/** Validate and encode a public lookup for subscription or dependency identity. */
export function getIndexObserverId(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): IndexValueId {
  const fields = collection?.indexes.get(indexKey) ?? [indexKey]
  const index = state?.indexes.get(indexKey)
  if (Array.isArray(indexValue))
    validateTupleLength(collection?.name, indexKey, fields.length, indexValue.length)
  const id = encodeIndexLookup(indexKey, fields.length, indexValue, index)
  if (fields.length > 1 && !Array.isArray(indexValue)) {
    assertLegacyAliasIsUnambiguous(index, collection?.name, indexKey, String(indexValue))
  }
  return id
}

/** Return canonical key ids for one exact or unambiguous legacy bucket. */
export function getIndexBucketIds(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): ReadonlySet<KeyId> | undefined {
  const fields = collection?.indexes.get(indexKey) ?? [indexKey]
  const index = state?.indexes.get(indexKey)
  if (Array.isArray(indexValue))
    validateTupleLength(collection?.name, indexKey, fields.length, indexValue.length)
  let valueId = encodeIndexLookup(indexKey, fields.length, indexValue, index)
  if (fields.length > 1 && !Array.isArray(indexValue)) {
    valueId = assertLegacyAliasIsUnambiguous(index, collection?.name, indexKey, String(indexValue))?.[0] ?? valueId
  }
  const ids = index?.buckets.get(valueId)
  return ids?.size ? ids : undefined
}

/** Return public keys for the public index-bucket API. */
export function getIndexBucket(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): ReadonlySet<string | number> | undefined {
  const ids = getIndexBucketIds(state, collection, indexKey, indexValue)
  if (!state || !ids)
    return undefined
  const keys = new Set<string | number>()
  for (const id of ids) keys.add(getPublicKey(state, id))
  return keys
}

/** Sweep excessive retained empty buckets after a complete queue flush. */
export function sweepEmptyIndexBuckets(ctx: EngineContext): void {
  for (const index of ctx.indexSweepCandidates) sweepIndex(index)
  ctx.indexSweepCandidates.clear()
}

/** Apply bounded retention policy to one index. */
function sweepIndex(index: EngineIndexState): void {
  const live = index.buckets.size - index.emptyBucketCount
  if (index.emptyBucketCount <= EMPTY_BUCKET_SWEEP_THRESHOLD || index.emptyBucketCount <= live * 2)
    return
  const empty: IndexValueId[] = []
  for (const [id, keys] of index.buckets) {
    if (!keys.size)
      empty.push(id)
  }
  const removed = new Set(empty)
  for (const id of empty) index.buckets.delete(id)
  index.emptyBucketCount = 0
  for (const id of empty) index.dependencyIds.delete(id)
  for (const [value, indexed] of index.scalarValues) {
    if (removed.has(indexed.id))
      index.scalarValues.delete(value)
  }
  for (const [first, bySecond] of index.tupleValues) {
    for (const [second, indexed] of bySecond) {
      if (removed.has(indexed.id))
        bySecond.delete(second)
    }
    if (!bySecond.size)
      index.tupleValues.delete(first)
  }
  for (const [legacy, aliases] of index.legacyAliases) {
    for (const id of removed) aliases.delete(id)
    if (!aliases.size) {
      index.legacyAliases.delete(legacy)
      index.dependencyIds.delete(encodeLegacyValue(legacy))
    }
  }
}

/** Reject a tuple with wrong index arity. */
function validateTupleLength(collection: string | undefined, indexKey: string, expected: number, actual: number): void {
  if (actual !== expected) {
    throw new TypeError(`Composite index "${collection ?? 'unknown'}.${indexKey}" expects ${expected} values, received ${actual}`)
  }
}

/** Return live alias targets or reject ambiguous joined composite input. */
function assertLegacyAliasIsUnambiguous(
  index: EngineIndexState | undefined,
  collection: string | undefined,
  indexKey: string,
  legacy: string,
): IndexValueId[] | undefined {
  const aliases = getLiveAliasTargets(index, legacy)
  if (aliases.length > 1) {
    throw new Error(`Ambiguous legacy composite index value "${legacy}" for "${collection ?? 'unknown'}.${indexKey}"; pass a value tuple instead`)
  }
  return aliases.length ? aliases : undefined
}
