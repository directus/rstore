import type { FindManyOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekManyOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  meta?: CustomHookMeta
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
  findOptions?: FindManyOptions<TModelType, TModelDefaults, TModel>
  force?: boolean
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
  meta,
  type,
  findOptions,
  force,
}: PeekManyOptions<TModelType, TModelDefaults, TModel>): QueryResult<Array<WrappedItem<TModelType, TModelDefaults, TModel>>> {
  meta = meta ?? {}

  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)
  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(type, findOptions)

    store.hooks.callHookSync('beforeCacheReadMany', {
      store,
      meta,
      type,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    let result = store.cache.readItems({
      type,
      marker: force ? undefined : getMarker('many', marker),
    })

    // console.log('peekMany', type, findOptions, result, getMarker('many', marker))

    if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter
      result = result.filter(item => filterFn(item))
    }

    store.hooks.callHookSync('cacheFilterMany', {
      store,
      meta,
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
