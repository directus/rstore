import type { Model, ModelDefaults, ResolvedModel, ResolvedModelItemBase, StoreSchema } from './model'
import type { ResolvedModule } from './module'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface CustomHookMeta {}

export interface HookDefinitions<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => Awaitable<void>

  beforeFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TModel, TModelDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  afterFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      many: boolean
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>> | ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      setMarker: (marker: string) => void
    }
  ) => void

  /**
   * Called when the store needs find an item in the cache.
   */
  cacheFilterFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined) => void
      readItemsFromCache: (options?: ReadItemsFromCacheOptions<TModel, TModelDefaults, TSchema>) => Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
    }
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      setMarker: (marker: string) => void
      setFilter: (filter: (item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => boolean) => void
    }
  ) => void

  /**
   * Called when the store needs to find many items in the cache.
   */
  cacheFilterMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>) => void
    }
  ) => void

  fetchRelations: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      findOptions: FindOptions<TModel, TModelDefaults, TSchema> & { include: NonNullable<FindOptions<TModel, TModelDefaults, TSchema>['include']> }
      many: boolean
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
    }
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  serializeItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
      modifyItem: <TItem extends Record<string, any>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  beforeMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>) => void
      mutation: 'create' | 'update' | 'delete'
    }
  ) => Awaitable<void>

  afterMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key: string | number
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TSchema> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key: string | number
    }
  ) => Awaitable<void>

  afterCacheWrite: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      key?: string | number
      result?: Array<ResolvedModelItemBase<TModel, TModelDefaults, TSchema>>
      marker?: string
      operation: 'write' | 'delete'
    }
  ) => void

  afterCacheReset: (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => void

  subscribe: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      /**
       * The subscription ID is used to identify the subscription for unsubscribing.
       */
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
    }
  ) => Awaitable<void>

  unsubscribe: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TSchema>
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TSchema>
    }
  ) => Awaitable<void>

  moduleResolved: (
    payload: {
      store: StoreCore<TSchema, TModelDefaults>
      module: ResolvedModule<any, any>
    }
  ) => Awaitable<void>
}

export type HookPayload = Parameters<HookDefinitions<StoreSchema, ModelDefaults>[keyof HookDefinitions<StoreSchema, ModelDefaults>]>[0]

export interface ReadItemsFromCacheOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends StoreSchema,
> {
  applyFilter?: boolean | ((item: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => boolean)
}
