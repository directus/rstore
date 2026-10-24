import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheRuntime, CacheWriteBatch } from './types'
import { isKeyDefined } from '@rstore/core'
import { ref, toRaw, toValue } from 'vue'
import { getCollectionIndex } from './context'

/** Reads the effective collection state, including every active cache layer. */
export type CollectionStateReader = (collectionName: string) => Record<string | number, any>

/** Rebuild every relation index from visible cached items after schema changes. */
export function rebuildIndexes(ctx: CacheRuntime, readCollectionState: CollectionStateReader) {
  ctx.state.collectionIndexes.clear()

  for (const collection of ctx.getStore().$collections) {
    const items = readCollectionState(collection.name)

    for (const item of Object.values(items)) {
      const data = toValue(item)
      if (!data) {
        continue
      }
      const key = collection.getKey(data)
      if (!isKeyDefined(key)) {
        continue
      }
      // Resolve the collection key before applying the same canonical index
      // identity used by live writes and hydrated rows.
      updateItemIndexes(ctx, collection, key, undefined, data)
    }
  }
}

/** Remove an item from every index it previously occupied. */
export function removeItemIndexes<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
  item: any,
) {
  for (const [indexKey, indexFields] of collection.indexes) {
    const index = getCollectionIndex(ctx, collection.name, indexKey)
    const previousValue = indexFields.map(f => item[f]).join(':')
    removeKeyFromBucket(index, previousValue, key)
  }
}

/**
 * Remove a key from an index bucket, dropping the bucket once it is empty.
 *
 * Every distinct join value gets its own bucket, so empty ones would pile up.
 * Dropping them is safe for reactive readers: `readItems` reads a missing
 * bucket as empty and also tracks the collection publication, which every
 * write that recreates a bucket triggers.
 */
function removeKeyFromBucket(index: Map<any, Ref<Set<string | number>>>, value: string, key: string | number, batch?: CacheWriteBatch) {
  const existingKeys = index.get(value)
  if (!existingKeys) {
    return
  }
  // A batch publishes once at settlement, so it edits the raw set silently.
  const keys = batch ? toRaw(existingKeys.value) : existingKeys.value
  keys.delete(String(key))
  if (keys.size === 0) {
    index.delete(value)
  }
}

/** Update index entries affected by changed item data. */
export function updateItemIndexes<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
  previousData: any,
  newData: any = {},
  batch?: CacheWriteBatch,
) {
  for (const [indexKey, indexFields] of collection.indexes) {
    if (!indexFields.some(f => f in newData && (!previousData || newData[f] !== previousData[f]))) {
      continue
    }

    const index = getCollectionIndex(ctx, collection.name, indexKey)
    if (previousData) {
      const values = indexFields.map(f => previousData?.[f])
      if (values.every(v => v != null)) {
        removeKeyFromBucket(index, values.join(':'), key, batch)
      }
    }

    // Fields absent from the partial write keep their previous value, but an
    // explicit `null` write must not fall back to it: a nulled join field
    // removes the item from the index bucket instead of re-adding it.
    const newValues = indexFields.map(f => f in newData ? newData[f] : previousData?.[f])
    if (newValues.every(v => v != null)) {
      const newValue = newValues.join(':')
      let existingKeys = index.get(newValue)
      if (!existingKeys) {
        existingKeys = ref(new Set())
        index.set(newValue, existingKeys)
      }
      // Keep index membership aligned with object-backed cache identity.
      const keys = batch ? toRaw(existingKeys.value) : existingKeys.value
      keys.add(String(key))
    }
  }
}
