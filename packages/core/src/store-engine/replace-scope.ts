import type { CacheScope, ResolvedCollection, WriteItem } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect } from './internal-types.js'
import { isKeyDefined } from '../key.js'
import { IncompleteCacheScopeError } from '../query/completeScope.js'
import { getPublicKey } from './identity.js'
import { getIndexBucketIds } from './indexes.js'
import { deleteItemFromBase, writeItemNow } from './write.js'

/** A fenced replacement of one complete indexed partition. */
export interface ReplaceScopeParams {
  /** Collection and partition authorized by the connector. */
  collection: ResolvedCollection
  scope: CacheScope
  /** All committed rows returned for this scope. */
  rows: WriteItem[]
  /** Recheck publication ownership when the operation reaches the queue head. */
  canApply: () => boolean
  /** Mark the partition complete before notifying observers of new rows. */
  onApplied: () => void
}

/** Apply an entire scope replacement using one shared engine change recorder. */
export function replaceScopeNow(ctx: EngineContext, changes: ChangeRecorder | undefined, params: ReplaceScopeParams): EngineEffect[] {
  const { collection, scope, rows } = params
  const keys = new Set<string>()
  for (const { key, value } of rows) {
    if (!isKeyDefined(key) || value?.[scope.field] !== scope.value || keys.has(String(key)))
      throw new IncompleteCacheScopeError(scope)
    keys.add(String(key))
  }

  const state = ctx.collections.get(collection.name)
  const previous = new Set(state && getIndexBucketIds(state, collection, scope.field, scope.value))
  // Visible indexes omit rows hidden by optimistic layers. Recover their
  // keys and check a candidate's committed partition before deleting it.
  for (const id of state?.layeredKeyCounts?.keys() ?? [])
    previous.add(id)

  const effects: EngineEffect[] = []
  for (const { key, value } of rows)
    effects.push(...writeItemNow(ctx, changes, { collection, key, item: value }).effects)
  if (state) {
    for (const id of previous) {
      if (keys.has(id) || state.base.get(id)?.[scope.field] !== scope.value)
        continue
      const key = getPublicKey(state, id)
      effects.push(...deleteItemFromBase(ctx, changes, { collection, key }).effects)
      ctx.fieldTimestamps.get(collection.name)?.delete(id)
    }
  }
  return effects
}
