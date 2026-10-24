import type { ResolvedCollection } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect } from './internal-types.js'
import type { PruneParams } from './types.js'
import { getPublicKey } from './identity.js'
import { deleteItemFromBase } from './write.js'

/** Item removed by a prune, reported once its deletion is published. */
export type PrunedItem = [collection: ResolvedCollection<any, any, any>, key: string | number]

/**
 * Delete every base item of the pruned collections that is not kept.
 *
 * Unlike garbage collection, ownership by other queries is ignored: a prune is
 * an explicit request to drop what a refreshed result no longer holds. Keys
 * owned by an active layer are spared, since an optimistic mutation is still
 * in flight for them. No tombstone is left, so the item can come back.
 */
export function pruneNow(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  params: PruneParams,
  pruned: PrunedItem[],
): EngineEffect[] {
  if (!params.canApply()) {
    return []
  }
  const keptKeys = params.getKeptKeys()
  const effects: EngineEffect[] = []
  for (const collectionName of params.collections) {
    const state = ctx.collections.get(collectionName)
    const collection = ctx.callbacks.getCollection(collectionName)
    if (!state || !collection) {
      continue
    }
    const kept = keptKeys.get(collectionName)
    // Snapshot the ids: each deletion mutates the base map.
    for (const id of Array.from(state.base.keys())) {
      if (kept?.has(id) || state.layeredKeyCounts?.has(id)) {
        continue
      }
      const key = getPublicKey(state, id)
      const result = deleteItemFromBase(ctx, changes, { collection, key })
      if (!result.removed) {
        continue
      }
      const timestamps = ctx.fieldTimestamps.get(collectionName)
      timestamps?.delete(id)
      if (timestamps?.size === 0) {
        ctx.fieldTimestamps.delete(collectionName)
      }
      effects.push(...result.effects)
      pruned.push([collection, key])
    }
  }
  return effects
}
