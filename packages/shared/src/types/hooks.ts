import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType } from './model'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface HookDefinitions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
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
      type: ResolvedModelType<TModelType, TModelDefaults>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
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
      type: ResolvedModelType<TModelType, TModelDefaults>
      key?: string
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => void
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
      type: ResolvedModelType<TModelType, TModelDefaults>
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => Array<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
      setResult: (result: Array<ResolvedModelItem<TModelType, TModelDefaults, TModel>>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
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
      type: ResolvedModelType<TModelType, TModelDefaults>
      findOptions?: FindOptions<TModelType, TModelDefaults, TModel>
      getResult: () => Array<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
      setResult: (result: Array<ResolvedModelItem<TModelType, TModelDefaults, TModel>>) => void
    }
  ) => void

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
      item: ResolvedModelItem<TModelType, TModelDefaults, TModel>
      modifyItem: <TItem extends ResolvedModelItem<TModelType, TModelDefaults, TModel>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  /**
   * Called when an item is created.
   */
  createItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
      item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
      getResult: () => ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => void
    }
  ) => void

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
      key: string
      item: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
      getResult: () => ResolvedModelItem<TModelType, TModelDefaults, TModel> | undefined
      setResult: (result: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => void
    }
  ) => void

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TModelType extends ModelType,
  > (
    payload: {
      store: StoreCore<TModel, TModelDefaults>
      type: ResolvedModelType<TModelType, TModelDefaults>
      key: string
    }
  ) => void
}
