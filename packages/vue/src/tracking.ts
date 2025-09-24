import type { Collection, CollectionDefaults, HookMetaQueryTracking, StoreSchema, WrappedItemBase } from '@rstore/shared'
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
  let queryTracking: HookMetaQueryTracking | null = null

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

  function handleQueryTracking(newQueryTracking: HookMetaQueryTracking, result?: TResult) {
    const _result = result ?? toValue(options.result)

    const isResultEmpty = _result == null || (Array.isArray(_result) && _result.length === 0)

    // Init the query tracking object if the result is not empty and there is no previous tracking
    if (!isResultEmpty && !queryTracking) {
      const keys = Object.keys(newQueryTracking)
      const isNewQueryTrackingEmpty = keys.length === 0 || keys.every(k => newQueryTracking[k]!.size === 0)

      if (isNewQueryTrackingEmpty) {
        const list = (Array.isArray(_result) ? _result : [_result])
        for (const item of list) {
          if (item) {
            addToQueryTracking(newQueryTracking, item)
          }
        }
      }

      {
        queryTracking = {}
        const list = Array.isArray(filteredCached.value) ? filteredCached.value : (filteredCached.value ? [filteredCached.value] : [])
        for (const item of list) {
          if (item) {
            addToQueryTracking(queryTracking, item)
          }
        }
      }

      function addToQueryTracking(qt: HookMetaQueryTracking, item: WrappedItemBase<Collection, CollectionDefaults, StoreSchema>) {
        const collection = store.$collections.find(c => c.name === item.$collection)
        if (!collection) {
          throw new Error(`Collection ${item.$collection} not found in the store`)
        }
        const set = qt![collection.name] ??= new Set()
        if (set.has(item.$getKey())) {
          return
        }
        set.add(item.$getKey())
        for (const relationName in collection.relations) {
          const value = item[relationName as keyof typeof item]
          if (Array.isArray(value)) {
            for (const relatedItem of value) {
              if (relatedItem) {
                addToQueryTracking(qt, relatedItem as WrappedItemBase<Collection, CollectionDefaults, StoreSchema>)
              }
            }
          }
        }
        item.$meta.queries.add(trackingQueryId)
      }
    }

    // Mark new tracked items as fresh
    for (const collectionName in newQueryTracking) {
      const collection = store.$collections.find(c => c.name === collectionName)!
      const oldKeys = queryTracking?.[collectionName]
      for (const key of newQueryTracking[collectionName]!) {
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

    // Mark old tracked items as dirty if they are not tracked anymore
    let hasAddedDirty = false
    for (const collectionName in queryTracking) {
      const collection = store.$collections.find(c => c.name === collectionName)!
      for (const key of queryTracking[collectionName]!) {
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

    // Filter out dirty items from the results
    if (hasAddedDirty && dataKey) {
      // Force refresh of the cached computed
      dataKey.value++
    }

    queryTracking = newQueryTracking
  }

  // Mark tracked items as dirty on unmount
  tryOnScopeDispose(() => {
    for (const collectionName in queryTracking) {
      const collection = store.$collections.find(c => c.name === collectionName)!
      for (const key of queryTracking[collectionName]!) {
        const item = store.$cache.readItem({
          collection,
          key,
        }) as WrappedItemBase<Collection, CollectionDefaults, StoreSchema> | undefined
        if (item) {
          item.$meta.queries.delete(trackingQueryId)
          item.$meta.dirtyQueries.add(trackingQueryId)

          store.$cache.garbageCollectItem({
            collection,
            item: item as any,
          })
        }
      }
    }
  })

  function createTrackingObject(): HookMetaQueryTracking {
    const obj: HookMetaQueryTracking = {}
    return obj
  }

  return {
    handleQueryTracking,
    filteredCached,
    createTrackingObject,
  }
}
