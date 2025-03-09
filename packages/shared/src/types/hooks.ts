import type { Model, ModelDefaults, ModelMap, ResolvedModel, ResolvedModelItemBase } from './model'
import type { FindOptions } from './query'
import type { StoreCore } from './store'
import type { Awaitable, Path, PathValue } from './utils'

// @TODO type generics

export interface CustomHookMeta {}

export interface HookDefinitions<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults,
> {
  init: (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => Awaitable<void>

  beforeFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      many: boolean
      updateFindOptions: (findOptions: FindOptions<TModel, TModelDefaults, TModelMap>) => void
    }
  ) => Awaitable<void>

  afterFetch: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      many: boolean
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>> | ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when the store needs to fetch an item.
   */
  fetchFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadFirst: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
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
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined) => void
      readItemsFromCache: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
    }
  ) => void

  /**
   * Called when the store needs to fetch many items.
   */
  fetchMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>) => void
      setMarker: (marker: string) => void
    }
  ) => Awaitable<void>

  beforeCacheReadMany: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
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
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      findOptions?: FindOptions<TModel, TModelDefaults, TModelMap>
      getResult: () => Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      setResult: (result: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>) => void
    }
  ) => void

  fetchRelations: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      findOptions: FindOptions<TModel, TModelDefaults, TModelMap> & NonNullable<FindOptions<TModel, TModelDefaults, TModelMap>['include']>
      many: boolean
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>
    }
  ) => Awaitable<void>

  /**
   * Called when an item is fetched by plugins.
   */
  parseItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      item: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
    }
  ) => void

  beforeMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      modifyItem: <TItem extends ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>) => void
      mutation: 'create' | 'update' | 'delete'
    }
  ) => Awaitable<void>

  afterMutation: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      item?: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key: string
      item: Partial<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      getResult: () => ResolvedModelItemBase<TModel, TModelDefaults, TModelMap> | undefined
      setResult: (result: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>) => void
    }
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key: string
    }
  ) => Awaitable<void>

  afterCacheWrite: <
    TModel extends Model,
  > (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
      model: ResolvedModel<TModel, TModelDefaults, TModelMap>
      key?: string
      result?: Array<ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>>
      marker?: string
      operation: 'write' | 'delete'
    }
  ) => void

  afterCacheReset: (
    payload: {
      store: StoreCore<TModelMap, TModelDefaults>
      meta: CustomHookMeta
    }
  ) => void
}
