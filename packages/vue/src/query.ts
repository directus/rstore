import type { FindOptions, HybridPromise, Model, ModelDefaults, ModelList } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueStore } from './store'
import { computed, ref, shallowRef, toValue, watch } from 'vue'

export interface VueQueryReturn<
  _TModel extends Model,
  _TModelDefaults extends ModelDefaults,
  _TModelList extends ModelList,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => HybridPromise<VueQueryReturn<_TModel, _TModelDefaults, _TModelList, TResult>>
  /**
   * @private
   */
  _result: Ref<TResult>
}

export interface VueCreateQueryOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TOptions extends FindOptions<TModel, TModelDefaults, TModelList>,
  TResult,
> {
  store: VueStore<TModelList, TModelDefaults>
  fetchMethod: (options?: TOptions) => Promise<TResult>
  cacheMethod: (options?: TOptions) => TResult
  defaultValue: TResult
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
}

/**
 * @private
 */
export function createQuery<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
  TOptions extends FindOptions<TModel, TModelDefaults, TModelList>,
  TResult,
>({
  store,
  fetchMethod,
  cacheMethod,
  defaultValue,
  options,
}: VueCreateQueryOptions<TModel, TModelDefaults, TModelList, TOptions, TResult>): HybridPromise<VueQueryReturn<TModel, TModelDefaults, TModelList, TResult>> {
  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

  const result = shallowRef<TResult>(defaultValue)

  // @TODO include nested relations in no-cache results
  const data = computed(() => fetchPolicy !== 'no-cache'
    ? cacheMethod(getOptions()) ?? null
    : result.value) as Ref<TResult>

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TModel, TModelDefaults, TModelList, TResult> = {
    data,
    loading,
    error,
    refresh,
    _result: result,
  }

  async function load() {
    if (!isDisabled()) {
      loading.value = true
      error.value = null

      try {
        const finalOptions: TOptions = getOptions() ?? {} as TOptions
        fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

        // If fetchPolicy is `cache-and-fetch`, fetch in parallel
        if (fetchPolicy === 'cache-and-fetch') {
          fetchMethod({
            ...finalOptions,
            fetchPolicy: 'fetch-only',
          } as FindOptions<TModel, TModelDefaults, TModelList> as any)
        }

        result.value = await fetchMethod(finalOptions)
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

  let promise = load() as HybridPromise<VueQueryReturn<TModel, TModelDefaults, TModelList, TResult>>
  Object.assign(promise, returnObject)

  function refresh() {
    if (!loading.value) {
      promise = load() as HybridPromise<VueQueryReturn<TModel, TModelDefaults, TModelList, TResult>>
      Object.assign(promise, returnObject)
    }
    return promise
  }

  store.$onCacheReset(() => {
    refresh()
  })

  return promise
}
