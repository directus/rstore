import type { CustomHookMeta, FindOptions, HybridPromise, Model, ModelDefaults, ResolvedModel, StoreSchema, WrappedItem } from '@rstore/shared'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { VueStore } from './store'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, toValue, watch } from 'vue'

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
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
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
  model,
  name,
}: VueCreateQueryOptions<TModel, TModelDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TModel, TModelDefaults, TSchema, TResult>> {
  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function getQueryId(): string {
    const options = getOptions() ?? {}
    return `${model.name}:${toValue(name)}:${JSON.stringify(options)}`
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let fetchPolicy = store.$getFetchPolicy(getOptions()?.fetchPolicy)

  const result: Ref<TResult> = shallowRef(toValue(defaultValue))
  const meta = ref<CustomHookMeta>({})

  const dataKey = ref(0)

  // @TODO include nested relations in no-cache results
  const data = computed(() => {
    // eslint-disable-next-line ts/no-unused-expressions
    dataKey.value // track dataKey to force recompute

    if (fetchPolicy !== 'no-cache') {
      const options = getOptions()
      const cacheResult = cacheMethod(options, meta.value) ?? null

      // Exclude dirty items from cache result
      if ((options?.experimentalGarbageCollection ?? store.$experimentalGarbageCollection) || (options?.experimentalFilterDirty)) {
        const queryId = getQueryId()
        if (Array.isArray(cacheResult)) {
          return cacheResult.filter((item: WrappedItem<TModel, TModelDefaults, TSchema>) => !item.$meta.dirtyQueries.has(queryId))
        }
        else {
          if ((cacheResult as unknown as WrappedItem<TModel, TModelDefaults, TSchema> | undefined)?.$meta.dirtyQueries.has(queryId)) {
            return undefined
          }
          else {
            return cacheResult
          }
        }
      }
      else {
        return cacheResult
      }
    }
    return result.value
  }) as Ref<TResult>

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

  let previousData: TResult | undefined

  if (!store.$isServer) {
    // Mark items as used in this query or as dirty if they didn't appear in the new result
    watch([data, result, () => getOptions()], ([_dataValue, resultValue], [oldDataValue, oldResultValue]) => {
      previousData = oldDataValue

      const queryId = getQueryId()

      // Old result
      if (Array.isArray(oldResultValue)) {
        for (const item of oldResultValue as Array<WrappedItem<TModel, TModelDefaults, TSchema>>) {
          item.$meta.queries.delete(queryId)
          item.$meta.dirtyQueries.add(queryId)
        }
      }
      else {
        const item = oldResultValue as WrappedItem<TModel, TModelDefaults, TSchema> | undefined
        item?.$meta.queries.delete(queryId)
        item?.$meta.dirtyQueries.add(queryId)
      }

      // Old cached result
      if (Array.isArray(oldDataValue)) {
        for (const item of oldDataValue as Array<WrappedItem<TModel, TModelDefaults, TSchema>>) {
          item.$meta.queries.delete(queryId)
          item.$meta.dirtyQueries.add(queryId)
        }
      }
      else {
        const item = oldDataValue as WrappedItem<TModel, TModelDefaults, TSchema> | undefined
        item?.$meta.queries.delete(queryId)
        item?.$meta.dirtyQueries.add(queryId)
      }

      // New result
      if (Array.isArray(resultValue)) {
        for (const item of resultValue as Array<WrappedItem<TModel, TModelDefaults, TSchema>>) {
          item.$meta.queries.add(queryId)
          item.$meta.dirtyQueries.delete(queryId)
        }
      }
      else {
        const item = resultValue as WrappedItem<TModel, TModelDefaults, TSchema> | undefined
        item?.$meta.queries.add(queryId)
        item?.$meta.dirtyQueries.delete(queryId)
      }
    })

    // Unmark items on unmount
    tryOnScopeDispose(() => {
      const queryId = getQueryId()
      if (Array.isArray(result.value)) {
        for (const item of result.value as Array<WrappedItem<TModel, TModelDefaults, TSchema>>) {
          item.$meta.queries.delete(queryId)
        }
      }
      else {
        const item = result.value as WrappedItem<TModel, TModelDefaults, TSchema> | undefined
        item?.$meta.queries.delete(queryId)
      }
    })

    watch(result, () => {
      // Force recompute of `data`
      dataKey.value++

      // Garbage collect items
      if (getOptions()?.experimentalGarbageCollection ?? store.$experimentalGarbageCollection) {
        // Defer to let other queries mark items as used if needed
        nextTick(() => {
          if (Array.isArray(previousData)) {
            for (const item of previousData as Array<WrappedItem<TModel, TModelDefaults, TSchema>>) {
              store.$cache.garbageCollectItem({ model, item })
            }
          }
          else {
            const item = previousData as WrappedItem<TModel, TModelDefaults, TSchema> | undefined
            if (item) {
              store.$cache.garbageCollectItem({ model, item })
            }
          }
        })
      }
    })
  }

  return promise
}
