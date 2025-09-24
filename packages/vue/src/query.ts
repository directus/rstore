import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, HookMetaQueryTracking, HybridPromise, ResolvedCollection, StoreSchema, WrappedItemBase } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueStore } from './store'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, toValue, watch } from 'vue'

export interface VueQueryReturn<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult>>
  meta: Ref<CustomHookMeta>
  /**
   * @private
   */
  _result: Ref<TResult>
}

export interface VueCreateQueryOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  store: VueStore<TSchema, TCollectionDefaults>
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  fetchMethod: (options: TOptions | undefined, meta: CustomHookMeta) => Promise<TResult>
  cacheMethod: (options: TOptions | undefined, meta: CustomHookMeta) => TResult
  defaultValue: MaybeRefOrGetter<TResult>
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
  name: MaybeRefOrGetter<string>
}

/**
 * @private
 */
export function createQuery<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
>({
  store,
  fetchMethod,
  cacheMethod,
  defaultValue,
  options,
  collection,
  name,
}: VueCreateQueryOptions<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult>> {
  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function getQueryId(): string {
    const options = getOptions() ?? {}
    return `${collection.name}:${toValue(name)}:${JSON.stringify(options)}`
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

  let queryTracking: HookMetaQueryTracking | null = null
  const queryTrackingEnabled = !store.$isServer && (getOptions()?.experimentalGarbageCollection ?? store.$experimentalGarbageCollection)

  const result: Ref<TResult> = shallowRef(toValue(defaultValue))
  const meta = ref<CustomHookMeta>({})

  const dataKey = ref(0)

  // @TODO include nested relations in no-cache results
  const data = computed(() => {
    // eslint-disable-next-line ts/no-unused-expressions
    dataKey.value // track dataKey to force recompute

    if (fetchPolicy !== 'no-cache') {
      const options = getOptions()
      const result = cacheMethod(options, meta.value) ?? null
      if (queryTrackingEnabled) {
        const queryId = getQueryId()
        if (Array.isArray(result)) {
          return result.filter((item: WrappedItemBase<TCollection, TCollectionDefaults, TSchema>) => !item.$meta.dirtyQueries.has(queryId))
        }
        else {
          return (result && !(result as unknown as WrappedItemBase<TCollection, TCollectionDefaults, TSchema>).$meta.dirtyQueries.has(queryId)) ? result : null
        }
      }
      return result
    }
    return result.value
  }) as Ref<TResult>

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult> = {
    data,
    loading,
    error,
    refresh,
    meta,
    _result: result,
  }

  async function load(force: boolean = false) {
    if (!isDisabled()) {
      loading.value = true
      error.value = null

      const newQueryTracking: HookMetaQueryTracking = {}
      let shouldHandleQueryTracking = true

      try {
        const finalOptions: TOptions = getOptions() ?? {} as TOptions
        fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

        // If fetchPolicy is `cache-and-fetch`, fetch in parallel
        if (!force && fetchPolicy === 'cache-and-fetch') {
          shouldHandleQueryTracking = false
          fetchMethod({
            ...finalOptions,
            fetchPolicy: 'fetch-only',
          } as FindOptions<TCollection, TCollectionDefaults, TSchema> as any, {
            ...meta.value,
            $queryTracking: queryTrackingEnabled ? newQueryTracking : undefined,
          }).then(() => {
            if (queryTrackingEnabled) {
              handleQueryTracking(newQueryTracking)
            }
          })
        }

        if (force) {
          finalOptions.fetchPolicy = 'fetch-only'
        }

        result.value = await fetchMethod(finalOptions, shouldHandleQueryTracking
          ? {
              ...meta.value,
              $queryTracking: queryTrackingEnabled ? newQueryTracking : undefined,
            }
          : meta.value)

        if (queryTrackingEnabled && shouldHandleQueryTracking) {
          handleQueryTracking(newQueryTracking)
        }
      }
      catch (e: any) {
        error.value = e
        console.error(e)
      }
      finally {
        loading.value = false
      }
    }

    return returnObject
  }

  function handleQueryTracking(newQueryTracking: HookMetaQueryTracking) {
    const queryId = getQueryId()

    const isResultEmpty = result.value == null || (Array.isArray(result.value) && result.value.length === 0)

    // Init the query tracking object if the result is not empty and there is no previous tracking
    if (!isResultEmpty && !queryTracking) {
      const keys = Object.keys(newQueryTracking)
      const isNewQueryTrackingEmpty = keys.length === 0 || keys.every(k => newQueryTracking[k]!.size === 0)

      if (isNewQueryTrackingEmpty) {
        const list = (Array.isArray(result.value) ? result.value : [result.value])
        for (const item of list) {
          if (item) {
            addToQueryTracking(newQueryTracking, item)
          }
        }
      }

      {
        queryTracking = {}
        const list = Array.isArray(data.value) ? data.value : (data.value ? [data.value] : [])
        for (const item of list) {
          if (item) {
            addToQueryTracking(queryTracking, item)
          }
        }
      }

      function addToQueryTracking(qt: HookMetaQueryTracking, item: WrappedItemBase<TCollection, TCollectionDefaults, TSchema>) {
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
                addToQueryTracking(qt, relatedItem as WrappedItemBase<TCollection, TCollectionDefaults, TSchema>)
              }
            }
          }
        }
        item.$meta.queries.add(queryId)
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
        }) as WrappedItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
        if (item) {
          item.$meta.queries.add(queryId)
          item.$meta.dirtyQueries.delete(queryId)
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
        }) as WrappedItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
        if (item) {
          item.$meta.queries.delete(queryId)
          item.$meta.dirtyQueries.add(queryId)

          hasAddedDirty = true

          // Clean garbage after the dirty items have a change to be removed from other queries
          // (e.g. after `dataKey.value++` updates the `data` computed property)
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
    if (hasAddedDirty) {
      // Force refresh of the data computed
      dataKey.value++
    }

    queryTracking = newQueryTracking
  }

  // Mark tracked items as dirty on unmount
  if (queryTrackingEnabled) {
    tryOnScopeDispose(() => {
      const queryId = getQueryId()
      for (const collectionName in queryTracking) {
        const collection = store.$collections.find(c => c.name === collectionName)!
        for (const key of queryTracking[collectionName]!) {
          const item = store.$cache.readItem({
            collection,
            key,
          }) as WrappedItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
          if (item) {
            item.$meta.queries.delete(queryId)
            item.$meta.dirtyQueries.add(queryId)

            store.$cache.garbageCollectItem({
              collection,
              item: item as any,
            })
          }
        }
      }
    })
  }

  // Auto load on options change
  watch(() => toValue(options), () => {
    load()
  }, {
    deep: true,
  })

  let promise = load() as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult>>
  Object.assign(promise, returnObject)

  function refresh() {
    if (!loading.value) {
      promise = load(true) as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult>>
      Object.assign(promise, returnObject)
    }
    return promise
  }

  store.$onCacheReset(() => {
    refresh()
  })

  return promise
}
