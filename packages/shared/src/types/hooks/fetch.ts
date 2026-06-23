import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { GlobalStoreType } from '../global'
import type { FindFirstOptions, FindManyOptions, FindOptions } from '../query'
import type { Awaitable, Path, PathValue } from '../utils'
import type { AbortableOptions, CustomHookMeta } from './meta'

/**
 * Options passed to cache reads from cache filter hooks.
 */
export interface ReadItemsFromCacheOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TCollectionList extends StoreSchema,
> {
  applyFilter?: boolean | ((item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TCollectionList>) => boolean)
}

/**
 * Fetch, parse, and cache-filter hooks.
 */
export interface FetchHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  resolveFindOptions: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    } & ({
      many: true
      findOptions?: FindManyOptions<TCollection, TCollectionDefaults, TSchema>
      updateFindOptions: (findOptions: FindManyOptions<TCollection, TCollectionDefaults, TSchema>) => void
    } | {
      many: false
      findOptions?: FindFirstOptions<TCollection, TCollectionDefaults, TSchema>
      updateFindOptions: (findOptions: FindFirstOptions<TCollection, TCollectionDefaults, TSchema>) => void
    }),
  ) => void

  beforeFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>) => void
    },
  ) => Awaitable<void>

  afterFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    },
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch one item.
   */
  fetchFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined, options?: AbortableOptions) => void
      setMarker: (marker: string | undefined) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string | undefined) => void
    },
  ) => void

  /**
   * Called when the store needs to find one item in cache.
   */
  cacheFilterFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined) => void
      readItemsFromCache: (options?: ReadItemsFromCacheOptions<TCollection, TCollectionDefaults, TSchema>) => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    },
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      setMarker: (marker: string | undefined) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string | undefined) => void
      setFilter: (filter: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean) => void
    },
  ) => void

  /**
   * Called when the store needs to find many items in cache.
   */
  cacheFilterMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
    },
  ) => void

  fetchRelations: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> }
      many: boolean
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  parseItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    },
  ) => void

  serializeItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends Record<string, any>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    },
  ) => void
}
