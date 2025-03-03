import type { FindOptions, HybridPromise, Model, ModelDefaults, ModelType, StoreCore } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, shallowRef, toValue, watch } from 'vue'

export interface VueQueryReturn<
  _TModelType extends ModelType,
  _TModelDefaults extends ModelDefaults,
  _TModel extends Model,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

export interface VueCreateQueryOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TOptions extends FindOptions<TModelType, TModelDefaults, TModel>,
  TResult,
> {
  store: StoreCore<TModel, TModelDefaults>
  fetchMethod: (options?: TOptions) => Promise<TResult>
  cacheMethod: (options?: TOptions) => TResult
  defaultValue: TResult
  options?: MaybeRefOrGetter<TOptions | undefined>
}

/**
 * @private
 */
export function createQuery<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TOptions extends FindOptions<TModelType, TModelDefaults, TModel>,
  TResult,
>({
  store,
  fetchMethod,
  cacheMethod,
  defaultValue,
  options,
}: VueCreateQueryOptions<TModelType, TModelDefaults, TModel, TOptions, TResult>): HybridPromise<VueQueryReturn<TModelType, TModelDefaults, TModel, TResult>> {
  const fetchPolicy = store.getFetchPolicy(toValue(options)?.fetchPolicy)

  const result = shallowRef<TResult>(defaultValue)

  // @TODO include nested relations in no-cache results
  const data = (fetchPolicy !== 'no-cache'
    ? computed(() => cacheMethod(toValue(options)) ?? null)
    : result) as Ref<TResult>

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TModelType, TModelDefaults, TModel, TResult> = {
    data,
    loading,
    error,
  }

  async function load() {
    loading.value = true
    error.value = null

    try {
      const finalOptions: TOptions = toValue(options) ?? {} as TOptions

      // If fetchPolicy is `cache-and-fetch`, fetch in parallel
      if (fetchPolicy === 'cache-and-fetch') {
        fetchMethod({
          ...finalOptions,
          fetchPolicy: 'fetch-only',
        } as FindOptions<TModelType, TModelDefaults, TModel> as any)
      }

      result.value = await fetchMethod(finalOptions)
    }
    catch (e: any) {
      error.value = e
    }
    finally {
      loading.value = false
    }

    return returnObject
  }

  // Auto load on options change
  watch(() => toValue(options), () => {
    load()
  }, {
    deep: true,
  })

  const promise = load() as HybridPromise<VueQueryReturn<TModelType, TModelDefaults, TModel, TResult>>
  Object.assign(promise, returnObject)
  return promise
}
