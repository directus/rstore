import type { CustomHookMeta, FindManyOptions, Model, ModelDefaults, QueryResult, ResolvedModel, ResolvedModelItemBase, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekManyOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  findOptions?: FindManyOptions<TModel, TModelDefaults, TSchema>
  force?: boolean
}

/**
 * Find all items that match the query in the cache without fetching the data from the adapter plugins.
 */
export function peekMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  model,
  findOptions,
  force,
}: PeekManyOptions<TModel, TModelDefaults, TSchema>): QueryResult<Array<WrappedItem<TModel, TModelDefaults, TSchema>>> {
  meta ??= {}

  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)
  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(model, findOptions)

    store.$hooks.callHookSync('beforeCacheReadMany', {
      store,
      meta,
      model,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    let result = store.$cache.readItems({
      model,
      marker: force ? undefined : getMarker('many', marker),
      filter: typeof findOptions?.filter === 'function' ? findOptions.filter as (item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => boolean : undefined,
    })

    store.$hooks.callHookSync('cacheFilterMany', {
      store,
      meta,
      model,
      findOptions,
      getResult: () => result,
      setResult: (value) => {
        result = value as Array<WrappedItem<TModel, TModelDefaults, TSchema>>
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
