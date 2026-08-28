import type { CacheIndexValue, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, EngineIndexBucket, EngineIndexState, IndexValueId, KeyId } from './internal-types.js'
import { getPublicKey } from './identity.js'
import { findIndexBucket } from './index-buckets.js'
import { cacheIndexDependencyId } from './index-dependencies.js'
import { encodeIndexLookup } from './index-value.js'

/** Validate and encode a public lookup for subscription identity. */
export function getIndexObserverId(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): IndexValueId {
  return resolveIndexLookup(state, collection, indexKey, indexValue).dependencyValueId
}

/** Return canonical key ids for one exact or unambiguous legacy bucket. */
export function getIndexBucketIds(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): ReadonlySet<KeyId> | undefined {
  const bucket = resolveIndexLookup(state, collection, indexKey, indexValue).bucket
  return bucket?.keys.size ? bucket.keys : undefined
}

/** Resolve one index dependency and current canonical bucket. */
export function getIndexRead(
  ctx: EngineContext,
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any>,
  indexKey: string,
  indexValue: CacheIndexValue,
): { dependency: string, ids: ReadonlySet<KeyId> | undefined } {
  const index = state?.indexes.get(indexKey)
  const lookup = resolveIndexLookup(state, collection, indexKey, indexValue)
  const dependency = cacheIndexDependencyId(ctx, index, collection.name, indexKey, lookup.dependencyValueId)
  return { dependency, ids: lookup.bucket?.keys.size ? lookup.bucket.keys : undefined }
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

/** Resolve dependency identity and direct bucket for one public lookup. */
function resolveIndexLookup(
  state: EngineCollectionState | undefined,
  collection: ResolvedCollection<any, any, any> | undefined,
  indexKey: string,
  indexValue: CacheIndexValue,
): { dependencyValueId: IndexValueId, bucket: EngineIndexBucket | undefined } {
  const fields = collection?.indexes.get(indexKey) ?? [indexKey]
  const index = state?.indexes.get(indexKey)
  if (Array.isArray(indexValue))
    validateTupleLength(collection?.name, indexKey, fields.length, indexValue.length)
  if (fields.length === 1) {
    if (Array.isArray(indexValue))
      return { dependencyValueId: encodeIndexLookup(indexKey, 1, indexValue), bucket: undefined }
    const value = String(indexValue)
    const bucket = index?.scalarBuckets.get(value)
    return { dependencyValueId: bucket?.valueId ?? encodeIndexLookup(indexKey, 1, value), bucket }
  }
  if (!Array.isArray(indexValue)) {
    const dependencyValueId = encodeIndexLookup(indexKey, fields.length, indexValue)
    const aliases = getLiveAliases(index, String(indexValue))
    if (aliases.length > 1)
      throw new Error(`Ambiguous legacy composite index value "${String(indexValue)}" for "${collection?.name ?? 'unknown'}.${indexKey}"; pass a value tuple instead`)
    return { dependencyValueId, bucket: aliases[0] }
  }
  if (fields.length === 2) {
    const first = String(indexValue[0])
    const second = String(indexValue[1])
    const bucket = index?.tupleBuckets.get(first)?.get(second)
    return { dependencyValueId: bucket?.valueId ?? encodeIndexLookup(indexKey, 2, [first, second]), bucket }
  }
  const values = indexValue.map(String)
  const dependencyValueId = encodeIndexLookup(indexKey, fields.length, values)
  return { dependencyValueId, bucket: index ? findIndexBucket(index, values) : undefined }
}

/** Return live buckets for one retained joined composite alias. */
function getLiveAliases(index: EngineIndexState | undefined, legacy: string): EngineIndexBucket[] {
  const result: EngineIndexBucket[] = []
  for (const bucket of index?.legacyAliases.get(legacy) ?? []) {
    if (bucket.keys.size)
      result.push(bucket)
  }
  return result
}

/** Reject a tuple with wrong index arity. */
function validateTupleLength(collection: string | undefined, indexKey: string, expected: number, actual: number): void {
  if (actual !== expected)
    throw new TypeError(`Composite index "${collection ?? 'unknown'}.${indexKey}" expects ${expected} values, received ${actual}`)
}
