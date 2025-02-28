import type { FindManyOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekManyOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults>
  findOptions?: FindManyOptions<TModelType, TModelDefaults, TModel>
}

/**
 * Find all items that match the query in the cache without fetching the data from the adapter plugins.
 */
export function peekMany<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  findOptions,
}: PeekManyOptions<TModelType, TModelDefaults, TModel>): QueryResult<Array<WrappedItem<TModelType, TModelDefaults, TModel>>> {
  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)
  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(type, findOptions)

    store.hooks.callHookSync('beforeCacheReadMany', {
      store,
      type,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    let result = store.cache.readItems({
      type,
      marker: getMarker('many', marker),
    })

    if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter
      result = result.filter(item => filterFn(item))
    }

    store.hooks.callHookSync('cacheFilterMany', {
      store,
      type,
      findOptions,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })
    return {
      result,
      marker,
    }
  }
  else {
    return {
      result: [],
    }
  }
}
