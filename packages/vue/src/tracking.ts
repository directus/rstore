import type { Collection, CollectionDefaults, FindOptionsInclude, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { VueStore } from './store'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, nextTick, ref, toValue } from 'vue'

export interface UseQueryTrackingOptions<TResult> {
  store: VueStore
  cached: MaybeRefOrGetter<TResult>
  result?: MaybeRefOrGetter<TResult>
}

export function useQueryTracking<TResult>(options: UseQueryTrackingOptions<TResult>) {
  const { store } = options

  const trackingQueryId = crypto.randomUUID()
  const queryTrackings = new Map<string, HookMetaQueryTracking>()

  const dataKey = ref(0)

  const filteredCached = computed<TResult>(() => {
    // eslint-disable-next-line ts/no-unused-expressions
    dataKey.value // track dataKey to force recompute

    const res = toValue(options.cached)
    if (res) {
      if (Array.isArray(res)) {
        return res.filter((item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>) => !item.$meta.dirtyQueries.has(trackingQueryId)) as TResult
      }
      else {
        return (!(res as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema>).$meta.dirtyQueries.has(trackingQueryId) ? res : null) as TResult
      }
    }
    return res
  })

  function handleQueryTracking(id: string, newQueryTracking: HookMetaQueryTracking, result?: TResult, include: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> = {}, markPreviousItemsAsDirty: boolean = true) {
    if (newQueryTracking.skipped) {
      return
    }

    const _result = result ?? toValue(options.result)

    const isResultEmpty = _result == null || (Array.isArray(_result) && _result.length === 0)

    let queryTracking = queryTrackings.get(id)

    // Init the query tracking object if the result is not empty and there is no previous tracking
    if (!isResultEmpty && !queryTracking) {
      const keys = Object.keys(newQueryTracking.items)
      const isNewQueryTrackingEmpty = keys.length === 0 || keys.every(k => newQueryTracking.items[k]!.size === 0)

      if (isNewQueryTrackingEmpty) {
        const list = (Array.isArray(_result) ? _result : [_result])
        for (const item of list) {
          if (item) {
            addToQueryTracking(newQueryTracking, item, include)
          }
        }
      }

      {
        queryTracking = createTrackingObject()
        queryTrackings.set(id, queryTracking)
        const list = Array.isArray(filteredCached.value) ? filteredCached.value : (filteredCached.value ? [filteredCached.value] : [])
        for (const item of list) {
          if (item) {
            addToQueryTracking(queryTracking, item, include)
          }
        }
      }
    }

    // Mark new tracked items as fresh
    for (const collectionName in newQueryTracking.items) {
      const collection = store.$collections.find(c => c.name === collectionName)
      if (collection) {
        const oldKeys = queryTracking?.items[collectionName]
        for (const key of newQueryTracking.items[collectionName]!) {
          const item = store.$cache.readItem({
            collection,
            key,
          }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
          if (item) {
            item.$meta.queries.add(trackingQueryId)
            item.$meta.dirtyQueries.delete(trackingQueryId)
            oldKeys?.delete(key)
          }
        }
      }
    }

    // Mark old tracked items as dirty if they are not tracked anymore
    let hasAddedDirty = false
    if (queryTracking && markPreviousItemsAsDirty) {
      for (const collectionName in queryTracking.items) {
        const collection = store.$collections.find(c => c.name === collectionName)
        if (collection) {
          for (const key of queryTracking.items[collectionName]!) {
            const item = store.$cache.readItem({
              collection,
              key,
            }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
            if (item) {
              item.$meta.queries.delete(trackingQueryId)
              item.$meta.dirtyQueries.add(trackingQueryId)

              hasAddedDirty = true

              // Clean garbage after the dirty items have a change to be removed from other queries
              // (e.g. after `dataKey.value++` updates the `cached` computed property)
              nextTick(() => {
                store.$cache.garbageCollectItem({
                  collection,
                  item: item as any,
                })
              })
            }
          }
        }
      }
    }

    // Filter out dirty items from the results
    if (hasAddedDirty && dataKey) {
      // Force refresh of the cached computed
      dataKey.value++
    }

    queryTracking = newQueryTracking
    queryTrackings.set(id, queryTracking)
  }

  // Mark tracked items as dirty on unmount
  tryOnScopeDispose(() => {
    for (const [, queryTracking] of queryTrackings) {
      for (const collectionName in queryTracking.items) {
        const collection = store.$collections.find(c => c.name === collectionName)
        if (collection) {
          for (const key of queryTracking.items[collectionName]!) {
            const item = store.$cache.readItem({
              collection,
              key,
            }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
            if (item) {
              item.$meta.queries.delete(trackingQueryId)
              item.$meta.dirtyQueries.add(trackingQueryId)
            }
          }
        }
      }
    }
  })

  function createTrackingObject(): HookMetaQueryTracking {
    const obj: HookMetaQueryTracking = {
      items: {},
    }
    return obj
  }

  function addToQueryTracking(qt: HookMetaQueryTracking, item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>, include: FindOptionsInclude<Collection, CollectionDefaults, StoreSchema>) {
    if (!item.$collection) {
      return
    }
    const collection = store.$collections.find(c => c.name === item.$collection)
    if (!collection) {
      return
    }
    const set = qt!.items[collection.name] ??= new Set()
    const itemKey = item.$getKey()
    if (set.has(itemKey)) {
      return
    }
    set.add(itemKey)
    for (const relationName in collection.relations) {
      if (include?.[relationName] && include[relationName] !== false) {
        const value = item[relationName as keyof typeof item] as unknown as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | Array<WrappedItemBase<Collection, CollectionDefaults, StoreSchema>>
        if (Array.isArray(value)) {
          for (const relatedItem of value) {
            if (relatedItem) {
              addToQueryTracking(qt, relatedItem, include[relationName])
            }
          }
        }
        else if (value != null) {
          addToQueryTracking(qt, value, include[relationName])
        }
      }
    }
  }

  return {
    handleQueryTracking,
    filteredCached,
    createTrackingObject,
    addToQueryTracking,
  }
}
