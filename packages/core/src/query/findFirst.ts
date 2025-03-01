import type { FindFirstOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekFirst } from './peekFirst'

export interface FindFirstParams<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  meta?: CustomHookMeta
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
  findOptions: string | FindFirstOptions<TModelType, TModelDefaults, TModel>
}

/**
 * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
 */
export async function findFirst<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  meta,
  type,
  findOptions: keyOrOptions,
}: FindFirstParams<TModelType, TModelDefaults, TModel>): Promise<QueryResult<WrappedItem<TModelType, TModelDefaults, TModel> | null>> {
  meta = meta ?? {}

  const findOptions: FindFirstOptions<TModelType, TModelDefaults, TModel> = typeof keyOrOptions === 'string'
    ? {
        key: keyOrOptions,
      }
    : keyOrOptions
  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

  let result: any
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekResult = peekFirst({
      store,
      meta,
      type,
      findOptions,
    })
    result = peekResult.result
    marker = peekResult.marker
  }

  if (!result && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(type, findOptions)
    }

    await store.hooks.callHook('beforeFetch', {
      store,
      meta,
      type,
      key: findOptions.key,
      findOptions,
      many: false,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    await store.hooks.callHook('fetchFirst', {
      store,
      meta,
      type,
      key: findOptions.key,
      findOptions,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
      setMarker: (value) => {
        marker = value
      },
    })

    await store.hooks.callHook('afterFetch', {
      store,
      meta,
      type,
      key: findOptions.key,
      findOptions,
      many: false,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })

    if (result) {
      store.processItemParsing(type, result)

      if (fetchPolicy !== 'no-cache') {
        const key = type.getKey(result)
        if (!key) {
          console.warn(`Key is undefined for ${type.name}. Item was not written to cache.`)
        }
        else {
          store.cache.writeItem({
            type,
            key,
            item: result,
            marker: getMarker('first', marker),
          })
        }
      }
    }
  }

  return {
    result,
    marker,
  }
}
