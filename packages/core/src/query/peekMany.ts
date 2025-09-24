import type { Collection, CollectionDefaults, CustomHookMeta, FindManyOptions, GlobalStoreType, QueryResult, ResolvedCollection, ResolvedCollectionItemBase, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { defaultMarker, getMarker } from '../cache'
import { shouldReadCacheFromFetchPolicy } from '../fetchPolicy'

export interface PeekManyOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  meta?: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  findOptions?: FindManyOptions<TCollection, TCollectionDefaults, TSchema>
  force?: boolean
}

/**
 * Find all items that match the query in the cache without fetching the data from the adapter plugins.
 */
export function peekMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions,
  force,
}: PeekManyOptions<TCollection, TCollectionDefaults, TSchema>): QueryResult<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>> {
  meta ??= {}

  if (findOptions?.meta) {
    Object.assign(meta, findOptions.meta)
  }

  const fetchPolicy = store.$getFetchPolicy(findOptions?.fetchPolicy)
  if (force || shouldReadCacheFromFetchPolicy(fetchPolicy)) {
    let marker = defaultMarker(collection, findOptions)
    let overrideFilter: ((item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean) | undefined

    store.$hooks.callHookSync('beforeCacheReadMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      setMarker: (value) => {
        marker = value
      },
      setFilter: (filter) => {
        overrideFilter = filter
      },
    })

    let result = store.$cache.readItems({
      collection,
      marker: force ? undefined : getMarker('many', marker),
      filter: overrideFilter ?? (typeof findOptions?.filter === 'function' ? findOptions.filter as (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean : undefined),
    })

    store.$hooks.callHookSync('cacheFilterMany', {
      store: store as unknown as GlobalStoreType,
      meta,
      collection,
      findOptions,
      getResult: () => result,
      setResult: (value) => {
        result = value as Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>
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
