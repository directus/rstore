import type { FindFirstOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekFirstOptions<
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
export function peekFirst<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  meta,
  type,
  findOptions: keyOrOptions,
}: PeekFirstOptions<TModelType, TModelDefaults, TModel>): QueryResult<WrappedItem<TModelType, TModelDefaults, TModel> | null> {
  meta = meta ?? {}

  const findOptions: FindFirstOptions<TModelType, TModelDefaults, TModel> = typeof keyOrOptions === 'string'
    ? {
        key: keyOrOptions,
      }
    : keyOrOptions
  const key = findOptions?.key
  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let result: any
    let marker = defaultMarker(type, findOptions)

    store.hooks.callHookSync('beforeCacheReadFirst', {
      store,
      meta,
      type,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    if (key) {
      result = store.cache.readItem({ type, key })
    }
    else if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter

      // Try with first marker first
      result = store.cache.readItems({
        type,
        marker: getMarker('first', marker),
      }).filter(item => filterFn(item))?.[0] ?? null

      // Fallback to many marker
      if (!result) {
        result = store.cache.readItems({
          type,
          marker: getMarker('many', marker),
        }).filter(item => filterFn(item))?.[0] ?? null
      }
    }

    store.hooks.callHookSync('cacheFilterFirst', {
      store,
      meta,
      type,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
      key,
      findOptions,
    })
    return {
      result,
      marker,
    }
  }
  else {
    return {
      result: null,
    }
  }
}
