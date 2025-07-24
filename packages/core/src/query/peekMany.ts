import type { CustomHookMeta, FindManyOptions, Model, ModelDefaults, ModelList, QueryResult, ResolvedModel, ResolvedModelItemBase, StoreCore, WrappedItem } from '@rstore/shared'
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
  meta ??= {}

  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)
  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(model, findOptions)
    let overrideFilter: ((item: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => boolean) | undefined

    store.$hooks.callHookSync('beforeCacheReadMany', {
      store,
      meta,
      model,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
      setFilter: (filter) => {
        overrideFilter = filter
      },
    })

    let result = store.$cache.readItems({
      model,
      marker: force ? undefined : getMarker('many', marker),
      filter: overrideFilter ?? (typeof findOptions?.filter === 'function' ? findOptions.filter as (item: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => boolean : undefined),
    })

    store.$hooks.callHookSync('cacheFilterMany', {
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
