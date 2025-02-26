import type { FindManyOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, TrackedItem, WriteItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekMany } from './peekMany'

export interface FindManyParams<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults>
  findOptions?: FindManyOptions<TModelType, TModelDefaults, TModel>
}

/**
 * Find all items that match the query.
 */
export async function findMany<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  findOptions,
}: FindManyParams<TModelType, TModelDefaults, TModel>): Promise<QueryResult<Array<TrackedItem<TModelType, TModelDefaults, TModel>>>> {
  const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

  let result: any
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekManyResult = peekMany({ store, type, findOptions })
    result = peekManyResult.result
    marker = peekManyResult.marker
  }

  if (!result?.length && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(type, findOptions)
    }

    await store.hooks.callHook('fetchMany', {
      store,
      type,
      findOptions,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
      setMarker: (value) => {
        marker = value
      },
    })

    if (result) {
      for (const item of result) {
        store.processItemParsing(type, item)
      }
    }

    if (fetchPolicy !== 'no-cache') {
      const items = result
      const writes: Array<WriteItem<TModelType, TModelDefaults, TModel>> = []
      for (const item of items) {
        const key = type.getKey(item)
        if (!key) {
          console.warn(`Key is undefined for ${type.name}. Item was not written to cache.`)
          continue
        }
        writes.push({ key, value: item })
      }
      store.cache.writeItems<TModelType>({
        type,
        items: writes,
        marker: getMarker('many', marker),
      })
    }
  }

  return {
    result,
    marker,
  }
}
