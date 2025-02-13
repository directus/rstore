import { type Cache, type FindOptions, get, type Hooks, type Model, type ModelDefaults, type Plugin, type QueryApi, type Store } from '@rstore/shared'
import { resolveModel } from './model'
import { setupPlugin } from './plugin'
import { createQueryApi } from './query'

export interface CreateStoreOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache
  model: TModel
  modelDefaults?: TModelDefaults
  plugins?: Array<Plugin>
  hooks: Hooks<TModel, TModelDefaults>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export async function createStore<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreOptions<TModel, TModelDefaults>): Promise<Store<TModel, TModelDefaults>> {
  // Create store

  const model = resolveModel(options.model, options.modelDefaults)

  const store: Store<TModel, TModelDefaults> = {
    cache: options.cache,
    model,
    modelDefaults: options.modelDefaults ?? {} as TModelDefaults,
    plugins: options.plugins ?? [],
    hooks: options.hooks,
    query: undefined as any,
    findDefaults: options.findDefaults ?? {},
  }

  // Query API

  const query = {} as {
    [TKey in keyof TModel]: QueryApi<TModel[TKey], TModelDefaults, TModel>
  }
  for (const key in model) {
    query[key] = createQueryApi({
      store,
      type: model[key],
    }) as QueryApi<TModel[keyof TModel], TModelDefaults, TModel>
  }

  store.query = query

  // Setup plugins

  for (const plugin of store.plugins) {
    await setupPlugin(store, plugin)
  }

  // Init store hook

  await store.hooks.callHook('init', {
    store,
  })

  // Model hooks

  store.hooks.hook('parseItem', (payload) => {
    if (payload.type.fields) {
      for (const path in payload.type.fields) {
        const fieldConfig = payload.type.fields[path]
        if (fieldConfig.parse) {
          const value = get(payload.item, path as any)
          if (value != null) {
            payload.modifyItem(path as any, fieldConfig.parse(value))
          }
        }
      }
    }
  })

  return store
}
