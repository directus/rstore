import { type CustomHookMeta, dedupePromise, type FindManyOptions, type Model, type ModelDefaults, type ModelList, type QueryResult, type ResolvedModel, type StoreCore, type WrappedItem, type WriteItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekMany } from './peekMany'

export interface FindManyParams<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: StoreCore<TModelList, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  findOptions?: FindManyOptions<TModel, TModelDefaults, TModelList>
}

/**
 * Find all items that match the query.
 */
export async function findMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  meta,
  model,
  findOptions,
}: FindManyParams<TModel, TModelDefaults, TModelList>): Promise<QueryResult<Array<WrappedItem<TModel, TModelDefaults, TModelList>>>> {
  if (findOptions?.dedupe === false) {
    return _findMany({
      store,
      meta,
      model,
      findOptions,
    })
  }

  const dedupeKey = JSON.stringify(findOptions)
  return dedupePromise(store.$dedupePromises, `findMany:${dedupeKey}`, () => _findMany({
    store,
    meta,
    model,
    findOptions,
  }))
}

async function _findMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  meta,
  model,
  findOptions,
}: FindManyParams<TModel, TModelDefaults, TModelList>): Promise<QueryResult<Array<WrappedItem<TModel, TModelDefaults, TModelList>>>> {
  meta ??= {}

  findOptions = findOptions ?? {}
  const fetchPolicy = store.$getFetchPolicy(findOptions.fetchPolicy)

  let result: any
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekManyResult = peekMany({
      store,
      meta,
      model,
      findOptions,
    })
    result = peekManyResult.result
    marker = peekManyResult.marker
  }

  if (!result?.length && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(model, findOptions)
    }

    await store.$hooks.callHook('beforeFetch', {
      store,
      meta,
      model,
      findOptions,
      many: true,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    await store.$hooks.callHook('fetchMany', {
      store,
      meta,
      model,
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
      findOptions,
      many: true,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })

    if (result) {
      for (const item of result) {
        store.$processItemParsing(model, item)
      }
    }

    if (fetchPolicy !== 'no-cache') {
      const items = result
      const writes: Array<WriteItem<TModel, TModelDefaults, TModelList>> = []
      for (const item of items) {
        const key = model.getKey(item)
        if (!key) {
          console.warn(`Key is undefined for ${model.name}. Item was not written to cache.`)
          continue
        }
        writes.push({ key, value: item })
      }
      if (writes.length) {
        store.$cache.writeItems<TModel>({
          model,
          items: writes,
          marker: getMarker('many', marker),
        })
      }
    }
  }

  if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    await store.$hooks.callHook('fetchRelations', {
      store,
      meta,
      model,
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
