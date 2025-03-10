import type { FindOptions, Model, ModelDefaults, ModelList, Plugin, StoreCore, WrappedItem } from '@rstore/shared'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createModelApi, type VueModelApi } from './api'
import { createCache } from './cache'

export interface CreateStoreOptions<
  TModelList extends ModelList = ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  models: TModelList
  modelDefaults?: TModelDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export type VueStoreModelApiProxy<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = {
  [M in TModelList[number] as M['name']]: VueModelApi<M, TModelDefaults, TModelList, WrappedItem<M, TModelDefaults, TModelList>>
}

export type VueStore<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = StoreCore<TModelList, TModelDefaults> & VueStoreModelApiProxy<TModelList, TModelDefaults>

export async function createStore<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModelList, TModelDefaults>): Promise<VueStore<TModelList, TModelDefaults>> {
  const store = await createStoreCore<TModelList, TModelDefaults>({
    models: options.models,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache({
      getStore,
    }),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
  })

  const queryCache: Map<string, VueModelApi<Model, TModelDefaults, TModelList, WrappedItem<Model, TModelDefaults, TModelList>>> = new Map()

  const modelNames = store.models.map(m => m.name)

  function getApi(key: string) {
    if (!queryCache.has(key)) {
      const model = store.models.find(m => m.name === key)
      if (!model) {
        throw new Error(`Model ${key} not found`)
      }
      queryCache.set(key, createModelApi(store, model))
    }
    return queryCache.get(key)
  }

  const storeProxy = new Proxy(store, {
    get(_, key) {
      if (typeof key === 'string' && modelNames.includes(key)) {
        return getApi(key)
      }

      return Reflect.get(store, key)
    },
  }) as VueStore<TModelList, TModelDefaults>

  /**
   * Access the store in sub objects like the cache to avoid circular dependencies.
   */
  function getStore() {
    return storeProxy
  }

  return storeProxy
}
