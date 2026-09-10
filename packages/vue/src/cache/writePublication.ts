import type { CacheRuntime, CacheWriteBatch } from './types'
import { toRaw } from 'vue'
import { evictCollectionStateCache, invalidateCollectionStateCache } from './context'

/** Evict derived state and defer notifications until the batch settles. */
export function invalidateCollectionWrite(ctx: CacheRuntime, collectionName: string, batch?: CacheWriteBatch) {
  if (batch) {
    evictCollectionStateCache(ctx, collectionName)
    batch.affectedCollections.add(collectionName)
  }
  else {
    invalidateCollectionStateCache(ctx, collectionName)
  }
}

/** Write silently during a batch, or notify immediately for a single write. */
export function setCollectionItem(collectionState: Record<string | number, any>, key: string | number, value: any, batch?: CacheWriteBatch) {
  const target = batch ? toRaw(collectionState) : collectionState
  target[key] = value
}
