import type { CustomHookMeta, FindOptions, HybridPromise, Model, ModelDefaults, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueStore } from './store'
import { computed, ref, shallowRef, toValue, watch } from 'vue'

export interface VueQueryReturn<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TResult>>
  meta: Ref<CustomHookMeta>
  /**
   * @private
   */
  _result: Ref<TResult>
}

export interface VueCreateQueryOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TModel, TModelDefaults, TSchema>,
  TResult,
> {
  store: VueStore<TSchema, TModelDefaults>
  fetchMethod: (options: TOptions | undefined, meta: CustomHookMeta) => Promise<TResult>
  cacheMethod: (options: TOptions | undefined, meta: CustomHookMeta) => TResult
  defaultValue: MaybeRefOrGetter<TResult>
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
}

/**
 * @private
 */
export function createQuery<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TModel, TModelDefaults, TSchema>,
  TResult,
>({
  store,
  fetchMethod,
  cacheMethod,
  defaultValue,
  options,
}: VueCreateQueryOptions<TModel, TModelDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TResult>> {
  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

  const result: Ref<TResult> = shallowRef(toValue(defaultValue))
  const meta = ref<CustomHookMeta>({})

  // @TODO include nested relations in no-cache results
  const data = computed(() => fetchPolicy !== 'no-cache'
    ? cacheMethod(getOptions(), meta.value) ?? null
    : result.value) as Ref<TResult>

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TModel, TModelDefaults, TSchema, TResult> = {
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

      try {
        const finalOptions: TOptions = getOptions() ?? {} as TOptions
        fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

        // If fetchPolicy is `cache-and-fetch`, fetch in parallel
        if (!force && fetchPolicy === 'cache-and-fetch') {
          fetchMethod({
            ...finalOptions,
            fetchPolicy: 'fetch-only',
          } as FindOptions<TModel, TModelDefaults, TSchema> as any, meta.value)
        }

        if (force) {
          finalOptions.fetchPolicy = 'fetch-only'
        }

        result.value = await fetchMethod(finalOptions, meta.value)
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

  let promise = load() as HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TResult>>
  Object.assign(promise, returnObject)

  function refresh() {
    if (!loading.value) {
      promise = load(true) as HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TResult>>
      Object.assign(promise, returnObject)
    }
    return promise
  }

  store.$onCacheReset(() => {
    refresh()
  })

  return promise
}
