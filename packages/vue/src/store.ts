import type { FindOptions, Model, ModelDefaults, Plugin, Store, TrackedItem } from '@rstore/shared'
import { createStore as _createStore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createCache } from './cache'
import { query, type VueQueryApi } from './query'

export interface CreateStoreOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  model: TModel
  modelDefaults?: TModelDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export type VueStoreQueryProxy<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = {
  [TKey in keyof TModel]: VueQueryApi<TModel[TKey], TModelDefaults, TModel, TrackedItem<TModel[TKey], TModelDefaults, TModel>>
}

export type VueStore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> = Store<TModel, TModelDefaults> & VueStoreQueryProxy<TModel, TModelDefaults>

export async function createStore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModel, TModelDefaults>): Promise<VueStore<TModel, TModelDefaults>> {
  const store = await _createStore({
    model: options.model,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache(),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
  })

  const queryCache: Map<keyof TModel, VueQueryApi<TModel[keyof TModel], TModelDefaults, TModel, TrackedItem<TModel[keyof TModel], TModelDefaults, TModel>>> = new Map()

  const storeProxy = new Proxy(store, {
    get(target, key) {
      if (key in target.model) {
        const typeName = key as keyof TModel
        if (!queryCache.has(typeName)) {
          queryCache.set(typeName, {
            // @ts-expect-error string or object type issues @TODO fix
            peekFirst: keyOrOptions => target.query[typeName].peekFirst(keyOrOptions),
            // @ts-expect-error string or object type issues @TODO fix
            findFirst: keyOrOptions => target.query[typeName].findFirst(keyOrOptions),
            peekMany: options => target.query[typeName].peekMany(options),
            findMany: options => target.query[typeName].findMany(options),
            // @ts-expect-error string or object type issues @TODO fix
            queryFirst: options => query(store, target.model[typeName], 'findFirst', 'peekFirst', options),
            // @ts-expect-error string or object type issues @TODO fix
            queryMany: options => query(store, target.model[typeName], 'findMany', 'peekMany', options),
          })
        }
        return queryCache.get(typeName)
      }

      return Reflect.get(target, key)
    },
  }) as VueStore<TModel, TModelDefaults>

  return storeProxy
}
