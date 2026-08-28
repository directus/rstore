import type { EngineIndexBucket, EngineIndexState, KeyId } from './internal-types.js'
import { encodeLegacyValue, encodeValues } from './index-value.js'

/** Create empty storage for one index arity. */
export function createIndexState(arity: number): EngineIndexState {
  return {
    arity,
    scalarBuckets: new Map(),
    tupleBuckets: new Map(),
    encodedBuckets: new Map(),
    emptyBucketCount: 0,
    legacyAliases: new Map(),
    dependencyIds: new Map(),
  }
}

/** Find an exact bucket from already coerced values. */
export function findIndexBucket(index: EngineIndexState, values: readonly string[]): EngineIndexBucket | undefined {
  if (index.arity === 1)
    return index.scalarBuckets.get(values[0]!)
  if (index.arity === 2)
    return index.tupleBuckets.get(values[0]!)?.get(values[1]!)
  return index.encodedBuckets.get(encodeValues(values))
}

/** Get or create one uniform exact bucket. */
export function ensureIndexBucket(index: EngineIndexState, values: readonly string[]): EngineIndexBucket {
  if (index.arity === 1)
    return ensureScalarIndexBucket(index, values[0]!)
  if (index.arity === 2)
    return ensureTupleIndexBucket(index, values[0]!, values[1]!)
  const existing = index.encodedBuckets.get(encodeValues(values))
  if (existing)
    return existing
  return createBucket(index, values)
}

/** Get or create one direct scalar bucket without temporary tuple storage. */
export function ensureScalarIndexBucket(index: EngineIndexState, value: string): EngineIndexBucket {
  return index.scalarBuckets.get(value) ?? createBucket(index, [value])
}

/** Get or create one direct two-field bucket without encoded hot lookup. */
export function ensureTupleIndexBucket(index: EngineIndexState, first: string, second: string): EngineIndexBucket {
  return index.tupleBuckets.get(first)?.get(second) ?? createBucket(index, [first, second])
}

/** Allocate and register one new uniform bucket. */
function createBucket(index: EngineIndexState, values: readonly string[]): EngineIndexBucket {
  const legacy = index.arity > 1 ? values.join(':') : undefined
  const bucket: EngineIndexBucket = {
    keys: new Set(),
    valueId: encodeValues(values),
    legacy,
    legacyId: legacy === undefined ? undefined : encodeLegacyValue(legacy),
  }
  if (index.arity === 1) {
    index.scalarBuckets.set(values[0]!, bucket)
  }
  else if (index.arity === 2) {
    const bySecond = index.tupleBuckets.get(values[0]!) ?? new Map<string, EngineIndexBucket>()
    index.tupleBuckets.set(values[0]!, bySecond)
    bySecond.set(values[1]!, bucket)
  }
  else {
    index.encodedBuckets.set(bucket.valueId, bucket)
  }
  if (legacy !== undefined) {
    const aliases = index.legacyAliases.get(legacy) ?? new Set<EngineIndexBucket>()
    index.legacyAliases.set(legacy, aliases)
    aliases.add(bucket)
  }
  return bucket
}

/** Add one live item id and revive retained empty storage. */
export function addBucketKey(index: EngineIndexState, bucket: EngineIndexBucket, id: KeyId): void {
  if (bucket.retainedEmpty) {
    bucket.retainedEmpty = false
    index.emptyBucketCount--
  }
  bucket.keys.add(id)
}

/** Remove one live item id and retain empty storage for hot reuse. */
export function removeBucketKey(index: EngineIndexState, bucket: EngineIndexBucket, id: KeyId): boolean {
  if (!bucket.keys.delete(id))
    return false
  if (!bucket.keys.size)
    bucket.retainedEmpty = true
  if (bucket.retainedEmpty)
    index.emptyBucketCount++
  return true
}

/** Return total live and empty bucket count. */
export function countIndexBuckets(index: EngineIndexState): number {
  if (index.arity === 1)
    return index.scalarBuckets.size
  if (index.arity === 2) {
    let count = 0
    for (const bySecond of index.tupleBuckets.values()) count += bySecond.size
    return count
  }
  return index.encodedBuckets.size
}

/** Remove every empty bucket from direct storage and aliases. */
export function removeEmptyIndexBuckets(index: EngineIndexState): EngineIndexBucket[] {
  const removed: EngineIndexBucket[] = []
  if (index.arity === 1)
    removeEmptyScalars(index, removed)
  else if (index.arity === 2)
    removeEmptyTuples(index, removed)
  else removeEmptyEncoded(index, removed)
  for (const bucket of removed) {
    if (bucket.legacy !== undefined) {
      const aliases = index.legacyAliases.get(bucket.legacy)
      aliases?.delete(bucket)
      if (!aliases?.size)
        index.legacyAliases.delete(bucket.legacy)
    }
  }
  index.emptyBucketCount = 0
  return removed
}

/** Remove empty scalar buckets. */
function removeEmptyScalars(index: EngineIndexState, removed: EngineIndexBucket[]): void {
  for (const [value, bucket] of index.scalarBuckets) {
    if (!bucket.keys.size) {
      index.scalarBuckets.delete(value)
      removed.push(bucket)
    }
  }
}

/** Remove empty two-field buckets and empty first-level maps. */
function removeEmptyTuples(index: EngineIndexState, removed: EngineIndexBucket[]): void {
  for (const [first, bySecond] of index.tupleBuckets) {
    for (const [second, bucket] of bySecond) {
      if (!bucket.keys.size) {
        bySecond.delete(second)
        removed.push(bucket)
      }
    }
    if (!bySecond.size)
      index.tupleBuckets.delete(first)
  }
}

/** Remove empty encoded high-arity buckets. */
function removeEmptyEncoded(index: EngineIndexState, removed: EngineIndexBucket[]): void {
  for (const [valueId, bucket] of index.encodedBuckets) {
    if (!bucket.keys.size) {
      index.encodedBuckets.delete(valueId)
      removed.push(bucket)
    }
  }
}
