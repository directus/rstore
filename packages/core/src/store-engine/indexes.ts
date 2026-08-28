import type { ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineCollectionState, EngineContext, EngineIndexBucket, EngineIndexState, IndexValueId, KeyId } from './internal-types.js'
import { mayRecordIndex, mayRecordIndexDependency, recordIndex } from './change-recorder.js'
import { getIndexDependencyId } from './change-set.js'
import { addBucketKey, createIndexState, ensureIndexBucket, ensureScalarIndexBucket, ensureTupleIndexBucket, findIndexBucket, removeBucketKey } from './index-buckets.js'
import { takePendingIndexDependency } from './index-dependencies.js'
import { EMPTY_BUCKET_SWEEP_THRESHOLD } from './index-sweep.js'
import { readIndexValues } from './index-value.js'
import { getVisibleKeyIds, resolveItemById } from './view.js'

/** Get or create one materialized index with stable arity. */
function ensureIndex(state: EngineCollectionState, indexKey: string, arity: number): EngineIndexState {
  let index = state.indexes.get(indexKey)
  if (!index) {
    index = createIndexState(arity)
    state.indexes.set(indexKey, index)
  }
  return index
}

/** Record exact tuple and legacy joined-string dependency changes. */
function touchBucket(
  changes: ChangeRecorder | undefined,
  collection: string,
  indexKey: string,
  index: EngineIndexState,
  bucket: EngineIndexBucket,
): void {
  if (!mayRecordIndex(changes, collection))
    return
  addDependency(changes, index, collection, indexKey, bucket.valueId)
  if (bucket.legacyId)
    addDependency(changes, index, collection, indexKey, bucket.legacyId)
}

/** Reuse one opaque dependency string across alternating writes. */
function addDependency(
  changes: ChangeRecorder | undefined,
  index: EngineIndexState,
  collection: string,
  indexKey: string,
  valueId: IndexValueId,
): void {
  let dependency = index.dependencyIds.get(valueId) ?? takePendingIndexDependency(changes?.ctx, collection, indexKey, valueId)
  if (dependency && !index.dependencyIds.has(valueId))
    index.dependencyIds.set(valueId, dependency)
  if (!mayRecordIndexDependency(changes, collection, dependency))
    return
  if (!dependency) {
    dependency = getIndexDependencyId(collection, indexKey, valueId)
    index.dependencyIds.set(valueId, dependency)
  }
  recordIndex(changes, collection, dependency)
}

/** Reconcile one item's indexes directly from previous and next values. */
export function reconcileItemIndexes(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: ResolvedCollection<any, any, any>,
  id: KeyId,
  previous: any | undefined,
  next: any | undefined,
): void {
  const state = ctx.ensureCollection(collection.name)
  for (const [indexKey, fields] of collection.indexes) {
    const index = ensureIndex(state, indexKey, fields.length)
    if (fields.length === 1) {
      reconcileScalarIndex(ctx, changes, collection.name, indexKey, index, id, fields[0]!, previous, next)
      continue
    }
    if (fields.length === 2) {
      reconcileTupleIndex(ctx, changes, collection.name, indexKey, index, id, fields[0]!, fields[1]!, previous, next)
      continue
    }
    const previousValues = readIndexValues(previous, fields)
    const nextValues = readIndexValues(next, fields)
    if (sameValues(previousValues, nextValues))
      continue
    if (previousValues) {
      const previousBucket = findIndexBucket(index, previousValues)
      if (previousBucket && removeBucketKey(index, previousBucket, id)) {
        touchBucket(changes, collection.name, indexKey, index, previousBucket)
        if (index.emptyBucketCount > EMPTY_BUCKET_SWEEP_THRESHOLD)
          ctx.indexSweepCandidates.add(index)
      }
    }
    if (nextValues) {
      const nextBucket = ensureIndexBucket(index, nextValues)
      addBucketKey(index, nextBucket, id)
      touchBucket(changes, collection.name, indexKey, index, nextBucket)
    }
  }
}

/** Reconcile one direct scalar membership without array or encoding work. */
function reconcileScalarIndex(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: string,
  indexKey: string,
  index: EngineIndexState,
  id: KeyId,
  field: string,
  previous: any,
  next: any,
): void {
  const previousRaw = previous?.[field]
  const nextRaw = next?.[field]
  const previousValue = previousRaw == null ? undefined : String(previousRaw)
  const nextValue = nextRaw == null ? undefined : String(nextRaw)
  if (previousValue === nextValue)
    return
  if (previousValue !== undefined) {
    const bucket = index.scalarBuckets.get(previousValue)
    if (bucket && removeBucketKey(index, bucket, id))
      removedBucket(ctx, changes, collection, indexKey, index, bucket)
  }
  if (nextValue !== undefined) {
    const bucket = ensureScalarIndexBucket(index, nextValue)
    addBucketKey(index, bucket, id)
    touchBucket(changes, collection, indexKey, index, bucket)
  }
}

/** Reconcile one direct two-field membership without tuple allocations. */
function reconcileTupleIndex(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: string,
  indexKey: string,
  index: EngineIndexState,
  id: KeyId,
  firstField: string,
  secondField: string,
  previous: any,
  next: any,
): void {
  const previousFirstRaw = previous?.[firstField]
  const previousSecondRaw = previous?.[secondField]
  const nextFirstRaw = next?.[firstField]
  const nextSecondRaw = next?.[secondField]
  const previousFirst = previousFirstRaw == null || previousSecondRaw == null ? undefined : String(previousFirstRaw)
  const previousSecond = previousFirst === undefined ? undefined : String(previousSecondRaw)
  const nextFirst = nextFirstRaw == null || nextSecondRaw == null ? undefined : String(nextFirstRaw)
  const nextSecond = nextFirst === undefined ? undefined : String(nextSecondRaw)
  if (previousFirst === nextFirst && previousSecond === nextSecond)
    return
  if (previousFirst !== undefined) {
    const bucket = index.tupleBuckets.get(previousFirst)?.get(previousSecond!)
    if (bucket && removeBucketKey(index, bucket, id))
      removedBucket(ctx, changes, collection, indexKey, index, bucket)
  }
  if (nextFirst !== undefined) {
    const bucket = ensureTupleIndexBucket(index, nextFirst, nextSecond!)
    addBucketKey(index, bucket, id)
    touchBucket(changes, collection, indexKey, index, bucket)
  }
}

/** Record one removed bucket and schedule bounded empty storage pruning. */
function removedBucket(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  collection: string,
  indexKey: string,
  index: EngineIndexState,
  bucket: EngineIndexBucket,
): void {
  touchBucket(changes, collection, indexKey, index, bucket)
  if (index.emptyBucketCount > EMPTY_BUCKET_SWEEP_THRESHOLD)
    ctx.indexSweepCandidates.add(index)
}

/** Rebuild buckets from one resolved collection view. */
export function rebuildIndexes(collection: ResolvedCollection<any, any, any>, state: EngineCollectionState): void {
  state.indexes.clear()
  for (const id of getVisibleKeyIds(state)) {
    const item = resolveItemById(state, id)
    if (!item)
      continue
    for (const [indexKey, fields] of collection.indexes) {
      const index = ensureIndex(state, indexKey, fields.length)
      if (fields.length === 1) {
        const raw = item[fields[0]!]
        if (raw != null)
          addBucketKey(index, ensureScalarIndexBucket(index, String(raw)), id)
        continue
      }
      if (fields.length === 2) {
        const first = item[fields[0]!]
        const second = item[fields[1]!]
        if (first != null && second != null)
          addBucketKey(index, ensureTupleIndexBucket(index, String(first), String(second)), id)
        continue
      }
      const values = readIndexValues(item, fields)
      if (!values)
        continue
      addBucketKey(index, ensureIndexBucket(index, values), id)
    }
  }
}

/** Check two small coerced index tuples without serialization. */
function sameValues(previous: readonly string[] | undefined, next: readonly string[] | undefined): boolean {
  if (previous === next)
    return true
  if (!previous || !next || previous.length !== next.length)
    return false
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] !== next[index])
      return false
  }
  return true
}
export { getIndexBucket, getIndexBucketIds, getIndexObserverId, getIndexRead } from './index-read.js'
