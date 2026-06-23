import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { ref } from 'vue'
import { getCollectionIndex } from './context'

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
    const existingKeys = index.get(previousValue)
    if (existingKeys) {
      existingKeys.value.delete(key)
    }
  }
}

/** Update index entries affected by changed item data. */
export function updateItemIndexes<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
  previousData: any,
  newData: any = {},
) {
  for (const [indexKey, indexFields] of collection.indexes) {
    if (!indexFields.some(f => f in newData && (!previousData || newData[f] !== previousData[f]))) {
      continue
    }

    const index = getCollectionIndex(ctx, collection.name, indexKey)
    if (previousData) {
      const values = indexFields.map(f => previousData?.[f])
      if (values.every(v => v != null)) {
        const previousValue = values.join(':')
        const existingKeys = index.get(previousValue)
        if (existingKeys) {
          existingKeys.value.delete(key)
        }
      }
    }

    const newValues = indexFields.map(f => newData[f] ?? previousData?.[f])
    if (newValues.every(v => v != null)) {
      const newValue = newValues.join(':')
      let existingKeys = index.get(newValue)
      if (!existingKeys) {
        existingKeys = ref(new Set())
        index.set(newValue, existingKeys)
      }
      existingKeys.value.add(key)
    }
  }
}
