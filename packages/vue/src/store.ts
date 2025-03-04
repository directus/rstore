import type { FindOptions, Model, ModelDefaults, Plugin, StoreCore, WrappedItem } from '@rstore/shared'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createModelApi, type VueModelApi } from './api'
import { createCache } from './cache'

export interface CreateStoreOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  model: TModel
  modelDefaults?: TModelDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export type VueStoreModelApiProxy<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = {
  [TKey in keyof TModel]: VueModelApi<TModel[TKey], TModelDefaults, TModel, WrappedItem<TModel[TKey], TModelDefaults, TModel>>
}

export type VueStore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = StoreCore<TModel, TModelDefaults> & VueStoreModelApiProxy<TModel, TModelDefaults>

export async function createStore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModel, TModelDefaults>): Promise<VueStore<TModel, TModelDefaults>> {
  const store = await createStoreCore<TModel, TModelDefaults>({
    model: options.model,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache({
      getStore,
    }),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
  })

  const queryCache: Map<keyof TModel, VueModelApi<TModel[keyof TModel], TModelDefaults, TModel, WrappedItem<TModel[keyof TModel], TModelDefaults, TModel>>> = new Map()

  const storeProxy = new Proxy(store, {
    get(_, key) {
      if (key in store.model) {
        const typeName = key as keyof TModel
        if (!queryCache.has(typeName)) {
          queryCache.set(typeName, createModelApi(store, store.model[typeName]))
        }
        return queryCache.get(typeName)
      }

      return Reflect.get(store, key)
    },
  }) as VueStore<TModel, TModelDefaults>

  /**
   * Access the store in sub objects like the cache to avoid circular dependencies.
   */
  function getStore() {
    return storeProxy
  }

  return storeProxy
}
