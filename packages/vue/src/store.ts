import type { FindOptions, Model, ModelDefaults, ModelList, Plugin, StoreCore, WrappedItem } from '@rstore/shared'
import { createStoreCore, resolveModel } from '@rstore/core'
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
  isServer?: boolean
}

export type VueStoreModelApiProxy<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = {
  [M in TModelList[number] as M['name']]: VueModelApi<M, TModelDefaults, TModelList, WrappedItem<M, TModelDefaults, TModelList>>
}

export type VueStore<
  TModelList extends ModelList = ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = StoreCore<TModelList, TModelDefaults> & VueStoreModelApiProxy<TModelList, TModelDefaults> & {
  $model: (modelName: string) => VueModelApi<any, TModelDefaults, TModelList, WrappedItem<any, TModelDefaults, TModelList>>
}

interface PrivateVueStore {
  $_modelNames: Set<string>
}

export async function createStore<
  const TModelList extends ModelList,
  const TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModelList, TModelDefaults>): Promise<VueStore<TModelList, TModelDefaults>> {
  let storeProxy = undefined as unknown as VueStore<TModelList, TModelDefaults>

  return createStoreCore<TModelList, TModelDefaults>({
    models: options.models,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache({
      getStore: () => storeProxy,
    }),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
    isServer: options.isServer,
    transformStore: (store) => {
      const privateStore = store as unknown as PrivateVueStore

      const queryCache: Map<string, VueModelApi<Model, TModelDefaults, TModelList, WrappedItem<Model, TModelDefaults, TModelList>>> = new Map()

      function getApi(key: string) {
        if (!queryCache.has(key)) {
          const model = storeProxy.$models.find(m => m.name === key)
          if (!model) {
            throw new Error(`Model ${key} not found`)
          }
          queryCache.set(key, createModelApi(storeProxy, model))
        }
        return queryCache.get(key)
      }

      privateStore.$_modelNames = new Set(store.$models.map(m => m.name))

      storeProxy = new Proxy(store, {
        get(_, key) {
          if (typeof key === 'string' && privateStore.$_modelNames.has(key)) {
            return getApi(key)
          }

          if (key === '$model') {
            return (modelName: string) => getApi(modelName)
          }

          return Reflect.get(store, key)
        },
      }) as VueStore<TModelList, TModelDefaults>

      return storeProxy
    },
  }) as Promise<VueStore<TModelList, TModelDefaults>>
}

export function addModel(store: VueStore, model: Model) {
  const privateStore = store as unknown as PrivateVueStore

  if (privateStore.$_modelNames.has(model.name)) {
    throw new Error(`Model ${model.name} already exists`)
  }

  store.$models.push(resolveModel(model, store.$modelDefaults))
  privateStore.$_modelNames.add(model.name)
}

export function removeModel(store: VueStore, modelName: string) {
  const privateStore = store as unknown as PrivateVueStore

  const index = store.$models.findIndex(m => m.name === modelName)
  if (index === -1) {
    throw new Error(`Model ${modelName} not found`)
  }

  store.$models.splice(index, 1)
  privateStore.$_modelNames.delete(modelName)
}
