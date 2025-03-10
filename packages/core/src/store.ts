import { type Cache, type CustomHookMeta, type FindOptions, get, type Hooks, type ModelDefaults, type ModelList, type Plugin, set, type StoreCore } from '@rstore/shared'
import { defaultFetchPolicy } from './fetchPolicy'
import { resolveModels } from './model'
import { setupPlugin } from './plugin'

export interface CreateStoreCoreOptions<
  TModelList extends ModelList = ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache
  models: TModelList
  modelDefaults?: TModelDefaults
  plugins?: Array<Plugin>
  hooks: Hooks<TModelList, TModelDefaults>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export async function createStoreCore<
  TModelList extends ModelList = ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreCoreOptions<TModelList, TModelDefaults>): Promise<StoreCore<TModelList, TModelDefaults>> {
  // Create store

  const models = resolveModels(options.models, options.modelDefaults)

  const store: StoreCore<TModelList, TModelDefaults> = {
    $cache: options.cache,
    $models: models,
    $modelDefaults: options.modelDefaults ?? {} as TModelDefaults,
    $plugins: options.plugins ?? [],
    $hooks: options.hooks,
    $findDefaults: options.findDefaults ?? {},
    $getFetchPolicy(value) {
      return value ?? store.$findDefaults.fetchPolicy ?? defaultFetchPolicy
    },
    $processItemParsing(model, item) {
      store.$hooks.callHookSync('parseItem', {
        store,
        meta: {},
        model,
        item,
        modifyItem: (path, value) => {
          set(item, path, value as any)
        },
      })
    },
    $getModel(item, modelNames?) {
      if (modelNames?.length === 1) {
        return store.$models.find(m => m.name === modelNames[0]) ?? null
      }
      const models = modelNames ? store.$models.filter(m => modelNames?.includes(m.name)) : store.$models
      for (const model of models) {
        if (model.isInstanceOf(item)) {
          return model
        }
      }
      return null
    },
    $mutationHistory: [],
  }

  // Setup plugins

  for (const plugin of store.$plugins) {
    await setupPlugin(store, plugin)
  }

  // Init store hook

  const meta: CustomHookMeta = {}

  await store.$hooks.callHook('init', {
    store,
    meta,
  })

  // Model hooks

  store.$hooks.hook('parseItem', (payload) => {
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
