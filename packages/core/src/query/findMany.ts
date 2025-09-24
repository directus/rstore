import type { Collection, CollectionDefaults, CustomHookMeta, FindManyOptions, FindOptions, GlobalStoreType, QueryResult, ResolvedCollection, ResolvedCollectionItemBase, StoreCore, StoreSchema, WrappedItem, WriteItem } from '@rstore/shared'
import { dedupePromise } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekMany } from './peekMany'

export interface FindManyParams<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  meta?: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  findOptions?: FindManyOptions<TCollection, TCollectionDefaults, TSchema>
}

/**
 * Find all items that match the query.
 */
export async function findMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions,
}: FindManyParams<TCollection, TCollectionDefaults, TSchema>): Promise<QueryResult<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>> {
  if (findOptions?.dedupe === false) {
    return _findMany({
      store,
      meta,
      collection,
      findOptions,
    })
  }

  const dedupeKey = JSON.stringify(findOptions)
  return dedupePromise(store.$dedupePromises, `findMany:${collection.name}:${dedupeKey}`, () => _findMany({
    store,
    meta,
    collection,
    findOptions,
  }))
}

async function _findMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions,
}: FindManyParams<TCollection, TCollectionDefaults, TSchema>): Promise<QueryResult<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>> {
  meta ??= {}
  findOptions ??= {}

  if (findOptions.meta) {
    Object.assign(meta, findOptions.meta)
  }

  const fetchPolicy = store.$getFetchPolicy(findOptions.fetchPolicy)

  let result: any[] | undefined
  let marker: string | undefined

  if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    const peekManyResult = peekMany({
      store,
      meta,
      collection,
      findOptions,
    })
    result = peekManyResult.result
    marker = peekManyResult.marker
  }

  if (!result?.length && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(collection, findOptions)
    }

    await store.$hooks.callHook('beforeFetch', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      many: true,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('fetchMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      getResult: () => result ?? [],
      setResult: (value, options) => {
        result = value
        if (result?.length && options?.abort !== false) {
          abort()
        }
      },
      setMarker: (value) => {
        marker = value
      },
      abort,
    })

    await store.$hooks.callHook('afterFetch', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      many: true,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })

    if (result) {
      for (const item of result) {
        store.$processItemParsing(collection, item)
      }

      if (fetchPolicy !== 'no-cache') {
        const items = result
        const writes: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> = []
        for (const item of items) {
          const key = collection.getKey(item)
          if (!key) {
            console.warn(`Key is undefined for ${collection.name}. Item was not written to cache.`)
            continue
          }
          writes.push({ key, value: item })
        }
        if (writes.length) {
          store.$cache.writeItems<TCollection>({
            collection,
            items: writes,
            marker: getMarker('many', marker),
            meta,
          })
        }
      }
    }
  }

  if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('fetchRelations', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions: findOptions as FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> },
      many: true,
      getResult: () => result,
      abort,
    })
  }

  if (result?.length) {
    result = result.map((item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => store.$cache.wrapItem({ collection, item }))
  }

  return {
    result: result ?? [],
    marker,
  }
}
