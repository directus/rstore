import type { FindFirstOptions, FindManyOptions, HybridPromise, Model, ModelDefaults, ModelType, QueryApi, Store, TrackedItem } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { shouldReadCacheFromFetchPolicy } from '@rstore/core'
import { computed, reactive, ref, toValue, watch } from 'vue'

export interface QueryReturn<
  _TModelType extends ModelType,
  _TModelDefaults extends ModelDefaults,
  _TModel extends Model,
  TResult,
> {
  data: Ref<TResult>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

/**
 * @private
 */
export function query<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TMethod extends 'findFirst' | 'findMany',
  TCacheMethod extends 'peekFirst' | 'peekMany',
  TOptions extends TMethod extends 'findFirst'
    ? FindFirstOptions<TModelType, TModelDefaults, TModel>
    : TMethod extends 'findMany'
      ? FindManyOptions<TModelType, TModelDefaults, TModel>
      : never,
  TResult extends Awaited<ReturnType<QueryApi<TModelType, TModelDefaults, TModel>[TMethod]>>,
>(
  store: Store<TModel, TModelDefaults>,
  model: TModelType,
  method: TMethod,
  cacheMethod: TCacheMethod,
  options?: MaybeRefOrGetter<TOptions>,
): HybridPromise<QueryReturn<TModelType, TModelDefaults, TModel, TResult>> {
  const fetchPolicy = store.getFetchPolicy(toValue(options)?.fetchPolicy)

  const query = store.query[model.name] as QueryApi<TModelType, TModelDefaults, TModel>

  const result = ref<TResult>((method === 'findFirst' ? null : []) as TResult)

  const data = (shouldReadCacheFromFetchPolicy(fetchPolicy)
    ? computed(() => query[cacheMethod](toValue(options)) ?? null)
    : result) as Ref<TResult>

  const loading = ref(false)

  const error = ref<Error | null>(null)

  const returnObject: QueryReturn<TModelType, TModelDefaults, TModel, TResult> = {
    data,
    loading,
    error,
  }

  async function load() {
    loading.value = true
    error.value = null

    try {
      const finalOptions = toValue(options)

      // If fetchPolicy is `cache-and-fetch`, fetch in parallel
      if (fetchPolicy === 'cache-and-fetch') {
        query[method]({
          ...finalOptions,
          fetchPolicy: 'fetch-only',
        })
      }

      const item = await query[method](finalOptions)
      result.value = item
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

  const promise = load() as HybridPromise<QueryReturn<TModelType, TModelDefaults, TModel, TResult>>
  Object.assign(promise, returnObject)
  return promise
}

export interface VueQueryApi<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
  TItem extends TrackedItem<TModelType, TModelDefaults, TModel>,
> extends QueryApi<TModelType, TModelDefaults, TModel> {
  /**
   * Create a reactive query for the first item that matches the given options.
   */
  queryFirst: (options?: MaybeRefOrGetter<string | FindFirstOptions<TModelType, TModelDefaults, TModel>>) => HybridPromise<QueryReturn<TModelType, TModelDefaults, TModel, TItem | null>>
  /**
   * Create a reactive query for all items that match the given options.
   */
  queryMany: (options?: MaybeRefOrGetter<FindManyOptions<TModelType, TModelDefaults, TModel>>) => HybridPromise<QueryReturn<TModelType, TModelDefaults, TModel, Array<TItem>>>
}
