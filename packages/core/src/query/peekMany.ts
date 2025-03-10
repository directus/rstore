import type { FindManyOptions, Model, ModelDefaults, ModelList, QueryResult, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekManyOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  findOptions?: FindManyOptions<TModel, TModelDefaults, TModelList>
  force?: boolean
}

/**
 * Find all items that match the query in the cache without fetching the data from the adapter plugins.
 */
export function peekMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  meta,
  model,
  findOptions,
  force,
}: PeekManyOptions<TModel, TModelDefaults, TModelList>): QueryResult<Array<WrappedItem<TModel, TModelDefaults, TModelList>>> {
  meta = meta ?? {}

  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)
  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(model, findOptions)

    store.hooks.callHookSync('beforeCacheReadMany', {
      store,
      meta,
      model,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    let result = store.cache.readItems({
      model,
      marker: force ? undefined : getMarker('many', marker),
    })

    // console.log('peekMany', model, findOptions, result, getMarker('many', marker))

    if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter
      result = result.filter(item => filterFn(item))
    }

    store.hooks.callHookSync('cacheFilterMany', {
      store,
      meta,
      model,
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
