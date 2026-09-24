import type { CachePruneParams, CacheRuntime } from './types'
import { isKeyDefined } from '@rstore/core'
import { isKeyPinnedByActiveLayer } from './layers'
import { invalidatePageRefsForItem } from './queryState'
import { deleteItemNow } from './writes'

/**
 * Delete every item of the pruned collections that is not kept.
 *
 * Unlike garbage collection, ownership by other queries is ignored: the prune
 * is an explicit request to drop what the refreshed result no longer holds.
 * Keys pinned by an active layer are spared, since an optimistic mutation is
 * still in flight for them. No tombstone is left, so the item can come back.
 */
export function pruneNow(ctx: CacheRuntime, params: CachePruneParams): void {
  if (!params.canApply()) {
    return
  }
  const keptKeys = params.getKeptKeys()
  const store = ctx.getStore()
  for (const collectionName of params.collections) {
    const collection = store.$collections.find(candidate => candidate.name === collectionName)
    const items = ctx.state.collections[collectionName]?.value
    if (!collection || !items) {
      continue
    }
    const kept = keptKeys.get(collectionName)
    // Snapshot the keys: each deletion mutates the collection state.
    for (const key of Object.keys(items)) {
      if (kept?.has(key) || isKeyPinnedByActiveLayer(ctx, collectionName, key)) {
        continue
      }
      // State keys are strings; field timestamps are keyed by the item's own key type.
      const itemKey = collection.getKey(items[key])
      const realKey = isKeyDefined(itemKey) ? itemKey : key
      if (deleteItemNow(ctx, collection, realKey)) {
        invalidatePageRefsForItem(ctx, collectionName, realKey)
      }
    }
  }
}
