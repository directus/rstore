import type { Collection, CollectionDefaults, CustomHookMeta, FindFirstOptions, GlobalStoreType, QueryResult, ResolvedCollection, ResolvedCollectionItemBase, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekFirstOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  meta?: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  findOptions: string | number | FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
  force?: boolean
}

/**
 * Find the first item that matches the query in the cache without fetching the data from the adapter plugins.
 */
export function peekFirst<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions: keyOrOptions,
  force,
}: PeekFirstOptions<TCollection, TCollectionDefaults, TSchema>): QueryResult<WrappedItem<TCollection, TCollectionDefaults, TSchema> | null> {
  meta ??= {}

  const findOptions: FindFirstOptions<TCollection, TCollectionDefaults, TSchema> = typeof keyOrOptions === 'string' || typeof keyOrOptions === 'number'
    ? {
        key: keyOrOptions,
      }
    : keyOrOptions

  const key = findOptions?.key

  if (findOptions.meta) {
    Object.assign(meta, findOptions.meta)
  }

  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)

  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let result: any
    let marker: string | undefined = defaultMarker(collection, findOptions)

    store.$hooks.callHookSync('beforeCacheReadFirst', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
    })

    if (key) {
      result = store.$cache.readItem({ collection, key })
    }
    else if (typeof findOptions?.filter === 'function') {
      const filterFn = findOptions.filter as (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean

      // Try with first marker first
      result = store.$cache.readItems({
        collection,
        marker: force ? undefined : getMarker('first', marker),
        filter: filterFn,
      })?.[0] ?? null

      // Fallback to many marker
      if (!result) {
        result = store.$cache.readItems({
          collection,
          marker: getMarker('many', marker),
          filter: filterFn,
        })?.[0] ?? null
      }
    }

    store.$hooks.callHookSync('cacheFilterFirst', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      getResult: () => result,
      setResult: (value) => {
        result = value
      },
      key,
      findOptions,
      readItemsFromCache: (options) => {
        function getFilter() {
          if (options?.applyFilter === true) {
            return findOptions?.filter as (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean
          }
          else if (typeof options?.applyFilter === 'function') {
            return options.applyFilter
          }
        }

        // Try with first marker first
        let items = store.$cache.readItems({
          collection,
          marker: force || !marker ? undefined : getMarker('first', marker),
          filter: getFilter(),
        }) ?? []

        // Fallback to many marker
        if (!items.length) {
          items = store.$cache.readItems({
            collection,
            marker: marker ? getMarker('many', marker) : undefined,
            filter: getFilter(),
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
