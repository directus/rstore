import type { FindOptions, ModelDefaults, ModelMap, Plugin, StoreCore, WrappedItem } from '@rstore/shared'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createModelApi, type VueModelApi } from './api'
import { createCache } from './cache'

export interface CreateStoreOptions<
  TModelMap extends ModelMap = ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  models: TModelMap
  modelDefaults?: TModelDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export type VueStoreModelApiProxy<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = {
  [TKey in keyof TModelMap]: VueModelApi<TModelMap[TKey], TModelDefaults, TModelMap, WrappedItem<TModelMap[TKey], TModelDefaults, TModelMap>>
}

export type VueStore<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = StoreCore<TModelMap, TModelDefaults> & VueStoreModelApiProxy<TModelMap, TModelDefaults>

export async function createStore<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModelMap, TModelDefaults>): Promise<VueStore<TModelMap, TModelDefaults>> {
  const store = await createStoreCore<TModelMap, TModelDefaults>({
    models: options.models,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache({
      getStore,
    }),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
  })

  const queryCache: Map<keyof TModelMap, VueModelApi<TModelMap[keyof TModelMap], TModelDefaults, TModelMap, WrappedItem<TModelMap[keyof TModelMap], TModelDefaults, TModelMap>>> = new Map()

  const storeProxy = new Proxy(store, {
    get(_, key) {
      if (key in store.models) {
        const typeName = key as keyof TModelMap
        if (!queryCache.has(typeName)) {
          queryCache.set(typeName, createModelApi(store, store.models[typeName]))
        }
        return queryCache.get(typeName)
      }

      return Reflect.get(store, key)
    },
  }) as VueStore<TModelMap, TModelDefaults>

  /**
   * Access the store in sub objects like the cache to avoid circular dependencies.
   */
  function getStore() {
    return storeProxy
  }

  return storeProxy
}
