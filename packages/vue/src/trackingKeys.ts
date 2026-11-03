import type { Collection, CollectionDefaults, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { VueStore } from './store'
import { findTrackedCollection } from './trackingRelations'

/** Iterate cached items represented by a tracking object. */
export function forEachTrackedItem(
  store: VueStore,
  tracking: HookMetaQueryTracking,
  callback: (item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>) => void,
): void {
  forEachTrackedKey(tracking, (collectionName, key) => {
    const collection = findTrackedCollection(store, collectionName)
    const item = collection && store.$cache.readItem({ collection, key }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
    if (item) {
      callback(item)
    }
  })
}

/** Iterate collection/key pairs in a tracking object. */
export function forEachTrackedKey(tracking: HookMetaQueryTracking, callback: (collectionName: string, key: string | number) => void): void {
  for (const [collectionName, keys] of Object.entries(tracking.items)) {
    for (const key of keys) {
      callback(collectionName, key)
    }
  }
}

/** Whether a page result supplies no item identity to a skipped payload. */
export function resultIsEmpty<TResult>(result: TResult | undefined): boolean {
  return result == null || (Array.isArray(result) && result.length === 0)
}

/** Check string-equivalent cache identity with at most two Set lookups. */
export function trackingHasKey(tracking: HookMetaQueryTracking, collectionName: string, key: string | number): boolean {
  const keys = tracking.items[collectionName]
  if (!keys)
    return false
  if (keys.has(key))
    return true
  if (typeof key === 'number')
    return keys.has(String(key))
  const numericKey = Number(key)
  // Round-trip before matching: '01', '1.0', and '-0' differ from numeric keys.
  return String(numericKey) === key && keys.has(numericKey)
}
