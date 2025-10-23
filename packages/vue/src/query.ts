import type { Collection, CollectionDefaults, CustomHookMeta, FindOptions, HybridPromise, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueStore } from './store'
import { computed, getCurrentInstance, onServerPrefetch, ref, shallowRef, toValue, watch } from 'vue'
import { useQueryTracking } from './tracking'

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
  fetchMethod: (options: TOptions | undefined, meta: CustomHookMeta) => Promise<TResult>
  cacheMethod: (options: TOptions | undefined, meta: CustomHookMeta) => TResult
  defaultValue: MaybeRefOrGetter<TResult>
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
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
}: VueCreateQueryOptions<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult>> {
  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

  const queryTrackingEnabled = !store.$isServer && fetchPolicy !== 'no-cache' && (
    store.$experimentalGarbageCollection
      ? getOptions()?.experimentalGarbageCollection !== false
      : getOptions()?.experimentalGarbageCollection === true
  )

  const result: Ref<TResult> = shallowRef(toValue(defaultValue))
  const meta = ref<CustomHookMeta>({})

  // @TODO include nested relations in no-cache results
  const cached = computed(() => {
    if (fetchPolicy !== 'no-cache') {
      const options = getOptions()
      return cacheMethod(options, meta.value) ?? null
    }
    return result.value
  }) as Ref<TResult>

  const queryTracking = queryTrackingEnabled
    ? useQueryTracking<TResult>({
        store,
        result,
        cached,
      })
    : null

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TResult> = {
    data: queryTracking?.filteredCached ?? cached,
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

      const newQueryTracking = queryTracking?.createTrackingObject()
      let shouldHandleQueryTracking = true

      try {
        const finalOptions: TOptions = getOptions() ?? {} as TOptions
        fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

        // If fetchPolicy is `cache-and-fetch`, fetch in parallel
        if (!force && fetchPolicy === 'cache-and-fetch') {
          shouldHandleQueryTracking = false
          const newQueryTracking2 = queryTracking?.createTrackingObject()
          fetchMethod({
            ...finalOptions,
            fetchPolicy: 'fetch-only',
          } as FindOptions<TCollection, TCollectionDefaults, TSchema> as any, {
            ...meta.value,
            $queryTracking: queryTrackingEnabled ? newQueryTracking2 : undefined,
          }).then(() => {
            if (queryTracking && newQueryTracking2) {
              queryTracking.handleQueryTracking(newQueryTracking2)
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

        if (queryTrackingEnabled && shouldHandleQueryTracking && queryTracking && newQueryTracking) {
          queryTracking.handleQueryTracking(newQueryTracking)
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

  // SSR
  const vm = getCurrentInstance()

  if (vm && store.$isServer) {
    onServerPrefetch(() => promise)
  }

  return promise
}
