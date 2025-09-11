import type { Collection, CollectionDefaults, CustomHookMeta, FindFirstOptions, FindOptions, QueryResult, ResolvedCollection, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { dedupePromise } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { peekFirst } from './peekFirst'

export interface FindFirstParams<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  meta?: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  findOptions: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
}

/**
 * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
 */
export async function findFirst<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions: keyOrOptions,
}: FindFirstParams<TCollection, TCollectionDefaults, TSchema>): Promise<QueryResult<WrappedItem<TCollection, TCollectionDefaults, TSchema> | null>> {
  if (typeof keyOrOptions === 'object' && keyOrOptions?.dedupe === false) {
    return _findFirst({
      store,
      meta,
      collection,
      findOptions: keyOrOptions,
    })
  }

  const dedupeKey = typeof keyOrOptions === 'string' ? keyOrOptions : JSON.stringify(keyOrOptions)
  return dedupePromise(store.$dedupePromises, `findFirst:${collection.name}:${dedupeKey}`, () => _findFirst({
    store,
    meta,
    collection,
    findOptions: keyOrOptions,
  }))
}

async function _findFirst<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions: keyOrOptions,
}: FindFirstParams<TCollection, TCollectionDefaults, TSchema>): Promise<QueryResult<WrappedItem<TCollection, TCollectionDefaults, TSchema> | null>> {
  meta ??= {}

  const findOptions: FindFirstOptions<TCollection, TCollectionDefaults, TSchema> = typeof keyOrOptions === 'string' || typeof keyOrOptions === 'number'
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
      collection,
      findOptions,
    })
    result = peekResult.result
    marker = peekResult.marker
  }

  if (!result && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    if (!marker) {
      marker = defaultMarker(collection, findOptions)
    }

    await store.$hooks.callHook('beforeFetch', {
      store,
      meta,
      collection,
      key: findOptions.key,
      findOptions,
      many: false,
      updateFindOptions: (value) => {
        Object.assign(findOptions, value)
      },
    })

    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('fetchFirst', {
      store,
      meta,
      collection,
      key: findOptions.key,
      findOptions,
      getResult: () => result,
      setResult: (value, options) => {
        result = value
        if (result && options?.abort !== false) {
          abort()
        }
      },
      setMarker: (value) => {
        marker = value
      },
    })

    await store.$hooks.callHook('afterFetch', {
      store,
      meta,
      collection,
      key: findOptions.key,
      findOptions,
      many: false,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
    })

    if (result) {
      store.$processItemParsing(collection, result)

      if (fetchPolicy !== 'no-cache') {
        const key = collection.getKey(result)
        if (!key) {
          console.warn(`Key is undefined for ${collection.name}. Item was not written to cache.`)
        }
        else {
          store.$cache.writeItem({
            collection,
            key,
            item: result,
            marker: getMarker('first', marker),
          })
        }
      }

      result = store.$cache.wrapItem({ collection, item: result })
    }
  }

  if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
    await store.$hooks.callHook('fetchRelations', {
      store,
      meta,
      collection,
      key: findOptions.key,
      findOptions: findOptions as FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> },
      many: false,
      getResult: () => result,
    })
  }

  return {
    result,
    marker,
  }
}
