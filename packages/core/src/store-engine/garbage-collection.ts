import type { ResolvedCollection } from '@rstore/shared'
import type { EngineContext, EngineEffect } from './internal-types.js'
import { createChangeRecorder, createFlushChangeRecorder, discardStateChangeSink } from './change-recorder.js'
import { toKeyId } from './identity.js'
import { dispatchImmediate } from './queue-dispatch.js'
import { deleteItemFromBase } from './write.js'

/**
 * Evict unused base rows of one collection in a single engine commit.
 *
 * Releasing a query can free many rows at once. Committing each eviction
 * separately makes every dependent reader re-run once per row, so the whole
 * batch shares one change recorder and one dispatch instead.
 *
 * @returns Keys that were actually evicted, in input order.
 */
export function garbageCollectKeys(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  keys: Iterable<string | number>,
): Array<string | number> {
  const state = ctx.collections.get(collection.name)
  const flush = createFlushChangeRecorder()
  const changes = createChangeRecorder(ctx, flush)
  const removed: Array<string | number> = []
  const effects: EngineEffect[] = []
  try {
    for (const key of keys) {
      // A visible optimistic patch/delete owns its base row until its layer is
      // removed; collecting it would make rollback lose authoritative data.
      if (state?.layeredKeyCounts?.has(toKeyId(key))) {
        continue
      }
      const result = deleteItemFromBase(ctx, changes, { collection, key })
      if (!result.removed) {
        continue
      }
      removed.push(key)
      effects.push(...result.effects)
      const timestamps = ctx.fieldTimestamps.get(collection.name)
      timestamps?.delete(toKeyId(key))
      if (timestamps?.size === 0)
        ctx.fieldTimestamps.delete(collection.name)
    }
    if (removed.length) {
      dispatchImmediate(ctx, changes, flush, effects)
    }
    else {
      discardStateChangeSink(changes)
    }
    return removed
  }
  catch (error) {
    discardStateChangeSink(changes)
    throw error
  }
}
