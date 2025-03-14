import type { FindFirstOptions, Model, ModelDefaults, ModelList, QueryResult, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekFirstOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  findOptions: string | number | FindFirstOptions<TModel, TModelDefaults, TModelList>
  force?: boolean
}

/**
 * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
 */
export function peekFirst<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  meta,
  model,
  findOptions: keyOrOptions,
  force,
}: PeekFirstOptions<TModel, TModelDefaults, TModelList>): QueryResult<WrappedItem<TModel, TModelDefaults, TModelList> | null> {
  meta ??= {}

  const findOptions: FindFirstOptions<TModel, TModelDefaults, TModelList> = typeof keyOrOptions === 'string' || typeof keyOrOptions === 'number'
    ? {
        key: keyOrOptions,
      }
    : keyOrOptions
  const key = findOptions?.key
  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)

  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let result: any
    let marker = defaultMarker(model, findOptions)

    store.$hooks.callHookSync('beforeCacheReadFirst', {
      store,
      meta,
      model,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    if (key) {
      result = store.$cache.readItem({ model, key })
    }
    else if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter

      // Try with first marker first
      result = store.$cache.readItems({
        model,
        marker: force ? undefined : getMarker('first', marker),
      }).filter(item => filterFn(item))?.[0] ?? null

      // Fallback to many marker
      if (!result) {
        result = store.$cache.readItems({
          model,
          marker: getMarker('many', marker),
        }).filter(item => filterFn(item))?.[0] ?? null
      }
    }

    store.$hooks.callHookSync('cacheFilterFirst', {
      store,
      meta,
      model,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
      key,
      findOptions,
      readItemsFromCache: () => {
        // Try with first marker first
        let items = store.$cache.readItems({
          model,
          marker: force ? undefined : getMarker('first', marker),
        }) ?? []

        // Fallback to many marker
        if (!items.length) {
          items = store.$cache.readItems({
            model,
            marker: getMarker('many', marker),
          }) ?? []
        }
        return items
      },
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
