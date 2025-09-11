import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from './collection'
import type { CacheLayer } from './layer'
import type { ResolvedModule } from './module'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface CustomHookMeta {}

export interface AbortableOptions {
  /**
   * If true, the remaining hooks in the queue will not be called.
   * @default true
   */
  abort?: boolean
}

export interface HookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
    }
  ) => Awaitable<void>

  beforeFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  afterFetch: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      many: boolean
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, options?: AbortableOptions) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string) => void
    }
  ) => void

  /**
   * Called when the store needs find an item in the cache.
   */
  cacheFilterFirst: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined) => void
      readItemsFromCache: (options?: ReadItemsFromCacheOptions<TCollection, TCollectionDefaults, TSchema>) => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    }
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      setMarker: (marker: string) => void
      setFilter: (filter: (item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => boolean) => void
    }
  ) => void

  /**
   * Called when the store needs to find many items in the cache.
   */
  cacheFilterMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
    }
  ) => void

  fetchRelations: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> }
      many: boolean
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    }
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  serializeItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
      modifyItem: <TItem extends Record<string, any>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  beforeMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
      mutation: 'create' | 'update' | 'delete'
    }
  ) => Awaitable<void>

  afterMutation: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
    }
  ) => Awaitable<void>

  afterCacheWrite: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      result?: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      marker?: string
      operation: 'write' | 'delete'
    }
  ) => void

  afterCacheReset: (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
    }
  ) => void

  subscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /**
       * The subscription ID is used to identify the subscription for unsubscribing.
       */
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    }
  ) => Awaitable<void>

  unsubscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TCollection, TCollectionDefaults, TSchema>
    }
  ) => Awaitable<void>

  moduleResolved: (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      module: ResolvedModule<any, any>
    }
  ) => Awaitable<void>

  itemGarbageCollect: <
    TCollection extends Collection,
  > (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>
    }
  ) => Awaitable<void>

  cacheLayerAdd: (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      layer: CacheLayer
    }
  ) => Awaitable<void>

  cacheLayerRemove: (
    payload: {
      store: StoreCore<TSchema, TCollectionDefaults>
      layer: CacheLayer
    }
  ) => Awaitable<void>
}

export type HookPayload = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>[keyof HookDefinitions<StoreSchema, CollectionDefaults>]>[0]

export interface ReadItemsFromCacheOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TCollectionList extends StoreSchema,
> {
  applyFilter?: boolean | ((item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TCollectionList>) => boolean)
}
