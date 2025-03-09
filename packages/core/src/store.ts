import type { CustomHookMeta } from '@rstore/shared/src/types/hooks'
import { type Cache, type FindOptions, get, type Hooks, type ModelDefaults, type ModelMap, type Plugin, set, type StoreCore } from '@rstore/shared'
import { defaultFetchPolicy } from './fetchPolicy'
import { resolveModels } from './model'
import { setupPlugin } from './plugin'

export interface CreateStoreCoreOptions<
  TModelMap extends ModelMap = ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache
  models: TModelMap
  modelDefaults?: TModelDefaults
  plugins?: Array<Plugin>
  hooks: Hooks<TModelMap, TModelDefaults>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export async function createStoreCore<
  TModelMap extends ModelMap = ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreCoreOptions<TModelMap, TModelDefaults>): Promise<StoreCore<TModelMap, TModelDefaults>> {
  // Create store

  const models = resolveModels(options.models, options.modelDefaults)

  const store: StoreCore<TModelMap, TModelDefaults> = {
    cache: options.cache,
    models,
    modelDefaults: options.modelDefaults ?? {} as TModelDefaults,
    plugins: options.plugins ?? [],
    hooks: options.hooks,
    findDefaults: options.findDefaults ?? {},
    getFetchPolicy(value) {
      return value ?? store.findDefaults.fetchPolicy ?? defaultFetchPolicy
    },
    processItemParsing(model, item) {
      store.hooks.callHookSync('parseItem', {
        store,
        meta: {},
        model,
        item,
        modifyItem: (path, value) => {
          set(item, path, value as any)
        },
      })
    },
    getModel(item, types?) {
      if (types?.length === 1) {
        return store.models[types[0]]
      }
      for (const key of types ?? Object.keys(store.models)) {
        const model = store.models[key]
        if (model.isInstanceOf(item)) {
          return model
        }
      }
      return null
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
    if (payload.model.fields) {
      for (const path in payload.model.fields) {
        const fieldConfig = payload.model.fields[path]
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
