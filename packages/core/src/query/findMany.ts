import type { CustomHookMeta, FindManyOptions, FindOptions, Model, ModelDefaults, QueryResult, ResolvedModel, ResolvedModelItemBase, StoreCore, StoreSchema, WrappedItem, WriteItem } from '@rstore/shared'
import { dedupePromise } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekMany } from './peekMany'

export interface FindManyParams<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TModelDefaults>
  meta?: CustomHookMeta
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  findOptions?: FindManyOptions<TModel, TModelDefaults, TSchema>
}

/**
 * Find all items that match the query.
 */
export async function findMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  model,
  findOptions,
}: FindManyParams<TModel, TModelDefaults, TSchema>): Promise<QueryResult<Array<WrappedItem<TModel, TModelDefaults, TSchema>>>> {
  if (findOptions?.dedupe === false) {
    return _findMany({
      store,
      meta,
      model,
      findOptions,
    })
  }

  const dedupeKey = JSON.stringify(findOptions)
  return dedupePromise(store.$dedupePromises, `findMany:${model.name}:${dedupeKey}`, () => _findMany({
    store,
    meta,
    model,
    findOptions,
  }))
}

async function _findMany<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  model,
  findOptions,
}: FindManyParams<TModel, TModelDefaults, TSchema>): Promise<QueryResult<Array<WrappedItem<TModel, TModelDefaults, TSchema>>>> {
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
      const writes: Array<WriteItem<TModel, TModelDefaults, TSchema>> = []
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
      findOptions: findOptions as FindOptions<TModel, TModelDefaults, TSchema> & { include: NonNullable<FindOptions<TModel, TModelDefaults, TSchema>['include']> },
      many: true,
      getResult: () => result,
    })
  }

  if (result?.length) {
    result = result.map((item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => store.$cache.wrapItem({ model, item }))
  }

  return {
    result,
    marker,
  }
}
