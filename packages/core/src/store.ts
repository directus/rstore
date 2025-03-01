import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Cache, type FindOptions, get, type Hooks, type Model, type ModelDefaults, type Plugin, set, type StoreCore } from '@rstore/shared'
import { defaultFetchPolicy } from './fetchPolicy'
import { resolveModel } from './model'
import { setupPlugin } from './plugin'

export interface CreateStoreCoreOptions<
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

export async function createStoreCore<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreCoreOptions<TModel, TModelDefaults>): Promise<StoreCore<TModel, TModelDefaults>> {
  // Create store

  const model = resolveModel(options.model, options.modelDefaults)

  const store: StoreCore<TModel, TModelDefaults> = {
    cache: options.cache,
    model,
    modelDefaults: options.modelDefaults ?? {} as TModelDefaults,
    plugins: options.plugins ?? [],
    hooks: options.hooks,
    findDefaults: options.findDefaults ?? {},
    getFetchPolicy(value) {
      return value ?? store.findDefaults.fetchPolicy ?? defaultFetchPolicy
    },
    processItemParsing(type, item) {
      store.hooks.callHookSync('parseItem', {
        store,
        meta: {},
        type,
        item,
        modifyItem: (path, value) => {
          set(item, path, value as any)
        },
      })
    },
    mutationHistory: [],
  }

  // Setup plugins

  for (const plugin of store.plugins) {
    await setupPlugin(store, plugin)
  }

  // Init store hook

  const meta: CustomHookMeta = {}

  await store.hooks.callHook('init', {
    store,
    meta,
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
