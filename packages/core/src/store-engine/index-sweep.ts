import type { EngineContext, EngineIndexState } from './internal-types.js'
import { countIndexBuckets, removeEmptyIndexBuckets } from './index-buckets.js'
import { encodeLegacyValue } from './index-value.js'

export const EMPTY_BUCKET_SWEEP_THRESHOLD = 256

/** Sweep excessive retained empty buckets after a complete queue flush. */
export function sweepEmptyIndexBuckets(ctx: EngineContext): void {
  for (const index of ctx.indexSweepCandidates) sweepIndex(ctx, index)
  ctx.indexSweepCandidates.clear()
}

/** Apply bounded retention policy to one index. */
function sweepIndex(ctx: EngineContext, index: EngineIndexState): void {
  const live = countIndexBuckets(index) - index.emptyBucketCount
  if (index.emptyBucketCount <= EMPTY_BUCKET_SWEEP_THRESHOLD || index.emptyBucketCount <= live * 2)
    return
  const removed = removeEmptyIndexBuckets(index)
  for (const bucket of removed) {
    const dependency = index.dependencyIds.get(bucket.valueId)
    if (!dependency || !hasIndexConsumer(ctx, dependency))
      index.dependencyIds.delete(bucket.valueId)
    if (bucket.legacy !== undefined) {
      const legacyId = bucket.legacyId ?? encodeLegacyValue(bucket.legacy)
      const legacyDependency = index.dependencyIds.get(legacyId)
      if (!index.legacyAliases.has(bucket.legacy) && (!legacyDependency || !hasIndexConsumer(ctx, legacyDependency)))
        index.dependencyIds.delete(legacyId)
    }
  }
}

/** Return whether an exact dependency must survive empty-bucket sweeping. */
function hasIndexConsumer(ctx: EngineContext, dependency: string): boolean {
  if (ctx.observers.hasIndex(dependency) || ctx.callbacks.stateChangeSink?.wantsIndex(dependency))
    return true
  for (const dependencies of ctx.callbacks.getStateChangeInterest?.()?.indexes.values() ?? []) {
    if (dependencies.has(dependency))
      return true
  }
  return false
}
