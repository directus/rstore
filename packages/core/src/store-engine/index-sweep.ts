import type { EngineContext, EngineIndexState, IndexValueId } from './internal-types.js'
import { encodeLegacyValue } from './index-value.js'

export const EMPTY_BUCKET_SWEEP_THRESHOLD = 256

/** Sweep excessive retained empty buckets after a complete queue flush. */
export function sweepEmptyIndexBuckets(ctx: EngineContext): void {
  for (const index of ctx.indexSweepCandidates) sweepIndex(ctx, index)
  ctx.indexSweepCandidates.clear()
}

/** Apply bounded retention policy to one index. */
function sweepIndex(ctx: EngineContext, index: EngineIndexState): void {
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
  for (const id of empty) {
    const dependency = index.dependencyIds.get(id)
    if (!dependency || !hasIndexConsumer(ctx, dependency))
      index.dependencyIds.delete(id)
  }
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
      const legacyId = encodeLegacyValue(legacy)
      const dependency = index.dependencyIds.get(legacyId)
      if (!dependency || !hasIndexConsumer(ctx, dependency))
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
