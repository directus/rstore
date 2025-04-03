import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItemBase } from './model'
import type { ResolvedModule } from './module'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface CustomHookMeta {}

export interface HookDefinitions<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => Awaitable<void>

  beforeFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TModel, TModelDefaults, TModelList>) => void
    }
  ) => Awaitable<void>

  afterFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      many: boolean
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>> | ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
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
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined) => void
      readItemsFromCache: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
    }
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      setMarker: (marker: string) => void
    }
  ) => void

  /**
   * Called when the store needs to find many items in the cache.
   */
  cacheFilterMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>) => void
    }
  ) => void

  fetchRelations: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      findOptions: FindOptions<TModel, TModelDefaults, TModelList> & NonNullable<FindOptions<TModel, TModelDefaults, TModelList>['include']>
      many: boolean
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList>
    }
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      item: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TModelList>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  beforeMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TModelList>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>) => void
      mutation: 'create' | 'update' | 'delete'
    }
  ) => Awaitable<void>

  afterMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key: string | number
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelList> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelList>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key: string | number
    }
  ) => Awaitable<void>

  afterCacheWrite: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      key?: string | number
      result?: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelList>>
      marker?: string
      operation: 'write' | 'delete'
    }
  ) => void

  afterCacheReset: (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => void

  subscribe: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      /**
       * The subscription ID is used to identify the subscription for unsubscribing.
       */
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
    }
  ) => Awaitable<void>

  unsubscribe: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelList>
      subscriptionId: string
      key?: string | number
      findOptions?: FindOptions<TModel, TModelDefaults, TModelList>
    }
  ) => Awaitable<void>

  moduleResolved: (
    payload: {
      store: StoreCore<TModelList, TModelDefaults>
      module: ResolvedModule<any, any>
    }
  ) => Awaitable<void>
}

export type HookPayload = Parameters<HookDefinitions<ModelList, ModelDefaults>[keyof HookDefinitions<ModelList, ModelDefaults>]>[0]
