import type { EngineContext, EngineIndexState, IndexValueId } from './internal-types.js'
import { getIndexDependencyId } from './change-set.js'

/** Cache one public opaque dependency after a reader or observer requests it. */
export function cacheIndexDependencyId(
  ctx: EngineContext,
  index: EngineIndexState | undefined,
  collection: string,
  indexKey: string,
  valueId: IndexValueId,
): string {
  const cached = index?.dependencyIds.get(valueId)
  if (cached)
    return cached
  const pending = getPendingDependencies(ctx, collection, indexKey, !index)
  const pendingValue = pending?.get(valueId)
  if (pendingValue) {
    if (index) {
      index.dependencyIds.set(valueId, pendingValue)
      pending!.delete(valueId)
    }
    return pendingValue
  }
  const dependency = getIndexDependencyId(collection, indexKey, valueId)
  if (index)
    index.dependencyIds.set(valueId, dependency)
  else pending!.set(valueId, dependency)
  return dependency
}

/** Move one dependency requested before index materialization into its index. */
export function takePendingIndexDependency(
  ctx: EngineContext | undefined,
  collection: string,
  indexKey: string,
  valueId: IndexValueId,
): string | undefined {
  if (!ctx)
    return undefined
  const byIndex = ctx.pendingIndexDependencies.get(collection)
  const dependencies = byIndex?.get(indexKey)
  const dependency = dependencies?.get(valueId)
  if (!dependency)
    return undefined
  dependencies!.delete(valueId)
  if (!dependencies!.size)
    byIndex!.delete(indexKey)
  if (!byIndex!.size)
    ctx.pendingIndexDependencies.delete(collection)
  return dependency
}

/** Get optional pre-index dependency storage without composite string keys. */
function getPendingDependencies(
  ctx: EngineContext,
  collection: string,
  indexKey: string,
  create: boolean,
): Map<IndexValueId, string> | undefined {
  let byIndex = ctx.pendingIndexDependencies.get(collection)
  if (!byIndex && create) {
    byIndex = new Map()
    ctx.pendingIndexDependencies.set(collection, byIndex)
  }
  let dependencies = byIndex?.get(indexKey)
  if (!dependencies && create) {
    dependencies = new Map()
    byIndex!.set(indexKey, dependencies)
  }
  return dependencies
}
