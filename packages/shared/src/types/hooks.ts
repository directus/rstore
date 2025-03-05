import type { Model, ModelDefaults, ModelType, ResolvedModelItemBase, ResolvedModelType } from './model'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface CustomHookMeta {}

export interface HookDefinitions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => Awaitable<void>

  beforeFetch: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TModelType, TModelDefaults, TModel>) => void
    }
  ) => Awaitable<void>

  afterFetch: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      many: boolean
      getResult: () => Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>> | ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      setMarker: (marker: string) => void
    }
  ) => void

  /**
   * Called when the store needs find an item in the cache.
   */
  cacheFilterFirst: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined) => void
      readItemsFromCache: () => Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
    }
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      setResult: (result: Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      setMarker: (marker: string) => void
    }
  ) => void

  /**
   * Called when the store needs to find many items in the cache.
   */
  cacheFilterMany: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      setResult: (result: Array<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>) => void
    }
  ) => void

  fetchRelations: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      findOptions: FindOptions<TModelType, TModelDefaults, TModel> & NonNullable<FindOptions<TModelType, TModelDefaults, TModel>['include']>
      many: boolean
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel>
    }
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      item: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>
      modifyItem: <TItem extends ResolvedModelItemBase<TModelType, TModelDefaults, TModel>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  beforeMutation: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      item?: Partial<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      modifyItem: <TItem extends ResolvedModelItemBase<TModelType, TModelDefaults, TModel>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>) => void
      mutation: 'create' | 'update' | 'delete'
    }
  ) => Awaitable<void>

  afterMutation: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key?: string
      item?: Partial<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      item: Partial<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key: string
      item: Partial<ResolvedModelItemBase<TModelType, TModelDefaults, TModel>>
      getResult: () => ResolvedModelItemBase<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItemBase<TModelType, TModelDefaults, TModel>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      meta: CustomHookMeta
      type: ResolvedModelType<TModelType, TModelDefaults, TModel>
      key: string
    }
  ) => Awaitable<void>
}
