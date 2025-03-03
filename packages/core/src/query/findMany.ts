import type { FindManyOptions, Model, ModelDefaults, ModelType, QueryResult, ResolvedModelType, StoreCore, WrappedItem, WriteItem } from '@rstore/shared'
import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekMany } from './peekMany'

export interface FindManyParams<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: StoreCore<TModel, TModelDefaults>
  meta?: CustomHookMeta
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
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
  meta,
  type,
  findOptions,
}: FindManyParams<TModelType, TModelDefaults, TModel>): Promise<QueryResult<Array<WrappedItem<TModelType, TModelDefaults, TModel>>>> {
  meta = meta ?? {}

  findOptions = findOptions ?? {}
  const fetchPolicy = store.getFetchPolicy(findOptions.fetchPolicy)

  let result: any
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekManyResult = peekMany({
      store,
      meta,
      type,
      findOptions,
    })
    result = peekManyResult.result
    marker = peekManyResult.marker
  }

  if (!result?.length && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(type, findOptions)
    }

    await store.hooks.callHook('beforeFetch', {
      store,
      meta,
      type,
      findOptions,
      many: true,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    await store.hooks.callHook('fetchMany', {
      store,
      meta,
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

    await store.hooks.callHook('afterFetch', {
      store,
      meta,
      type,
      findOptions,
      many: true,
      getResult: () => result,
      setResult: (value) => {
        result = value
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

  if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    await store.hooks.callHook('fetchRelations', {
      store,
      meta,
      type,
      findOptions,
      many: true,
      getResult: () => result,
    })
  }

  return {
    result,
    marker,
  }
}
