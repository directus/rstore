import type { FindFirstOptions, Model, ModelDefaults, ModelList, QueryResult, ResolvedModel, StoreCore, WrappedItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekFirst } from './peekFirst'

export interface FindFirstParams<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  findOptions: string | FindFirstOptions<TModel, TModelDefaults, TModelList>
}

/**
 * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
 */
export async function findFirst<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  meta,
  model,
  findOptions: keyOrOptions,
}: FindFirstParams<TModel, TModelDefaults, TModelList>): Promise<QueryResult<WrappedItem<TModel, TModelDefaults, TModelList> | null>> {
  meta = meta ?? {}

  const findOptions: FindFirstOptions<TModel, TModelDefaults, TModelList> = typeof keyOrOptions === 'string'
    ? {
        key: keyOrOptions,
      }
    : keyOrOptions
  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)

  let result: any
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekResult = peekFirst({
      store,
      meta,
      model,
      findOptions,
    })
    result = peekResult.result
    marker = peekResult.marker
  }

  if (!result && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(model, findOptions)
    }

    await store.$hooks.callHook('beforeFetch', {
      store,
      meta,
      model,
      key: findOptions.key,
      findOptions,
      many: false,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    await store.$hooks.callHook('fetchFirst', {
      store,
      meta,
      model,
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

    await store.$hooks.callHook('afterFetch', {
      store,
      meta,
      model,
      key: findOptions.key,
      findOptions,
      many: false,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })

    if (result) {
      store.$processItemParsing(model, result)

      if (fetchPolicy !== 'no-cache') {
        const key = model.getKey(result)
        if (!key) {
          console.warn(`Key is undefined for ${model.name}. Item was not written to cache.`)
        }
        else {
          store.$cache.writeItem({
            model,
            key,
            item: result,
            marker: getMarker('first', marker),
          })
        }
      }
    }
  }

  if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    await store.$hooks.callHook('fetchRelations', {
      store,
      meta,
      model,
      key: findOptions.key,
      findOptions,
      many: false,
      getResult: () => result,
    })
  }

  return {
    result,
    marker,
  }
}
