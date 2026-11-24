import type { Cache, HookMetaQueryTracking, ResolvedCollection } from '@rstore/shared'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import { nextTick } from 'vue'
import { forEachTrackedKey } from './trackingKeys'
import { findTrackedCollection } from './trackingRelations'

/** Queue released rows once per collection, after reactive ownership settles. */
export function createQueryCollector(store: VueStore) {
  const cache = store.$cache as Cache & VueCachePrivate
  let pending: Map<ResolvedCollection<any, any, any>, Set<string | number>> | undefined

  /** Re-read current wrappers so a replacement can acquire ownership while queued. */
  function collect(): void {
    const batch = pending
    pending = undefined
    if (!batch)
      return
    for (const [collection, keys] of batch) {
      const items = store.$cache.readItems({ collection, keys: [...keys] })
      store.$cache.garbageCollectItems({ collection, items })
    }
  }

  /** Queue an identity released by a fetched page or by the visible result. */
  function schedule(collection: ResolvedCollection<any, any, any>, key: string | number): void {
    if (cache._private.scheduleManagedRowGc(collection))
      return
    if (!pending) {
      pending = new Map()
      void nextTick(collect)
    }
    let keys = pending.get(collection)
    if (!keys) {
      keys = new Set()
      pending.set(collection, keys)
    }
    keys.add(key)
  }

  /** Queue the rows that fell out of the visible result. */
  function scheduleReleased(tracking: HookMetaQueryTracking): void {
    forEachTrackedKey(tracking, (collectionName, key) => {
      const collection = findTrackedCollection(store, collectionName)
      if (collection)
        schedule(collection, key)
    })
  }

  return { schedule, scheduleReleased }
}
