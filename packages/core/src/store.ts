import type { Cache, CustomHookMeta, FindOptions, Hooks, Model, ModelDefaults, ModelList, MutationSpecialProps, Plugin, StoreCore } from '@rstore/shared'
import { get, set } from '@rstore/shared'
import { defaultFetchPolicy } from './fetchPolicy'
import { resolveModels } from './model'
import { createModule } from './module'
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
  isServer?: boolean
  transformStore?: (store: StoreCore<TModelList, TModelDefaults>) => StoreCore<TModelList, TModelDefaults>
}

export async function createStoreCore<
  TModelList extends ModelList = ModelList,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreCoreOptions<TModelList, TModelDefaults>): Promise<StoreCore<TModelList, TModelDefaults>> {
  // Create store

  const models = resolveModels(options.models, options.modelDefaults)

  let store: StoreCore<TModelList, TModelDefaults> = {
    $cache: options.cache,
    $models: models,
    $modelDefaults: options.modelDefaults ?? {} as TModelDefaults,
    $plugins: options.plugins?.map(p => ({ ...p, hooks: {} })) ?? [],
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
    $processItemSerialization(model, item) {
      store.$hooks.callHookSync('serializeItem', {
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
    $isServer: options.isServer ?? false,
    $dedupePromises: new Map(),
    $createModule(module) {
      return createModule(store, module)
    },
    $registeredModules: new Map(),
    $wrapMutation: mutation => mutation as typeof mutation & MutationSpecialProps,
  }

  if (options.transformStore) {
    store = options.transformStore(store)
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
        const fieldConfig = payload.model.fields[path]!
        if (fieldConfig.parse) {
          const value = get(payload.item, path as any)
          if (value != null) {
            payload.modifyItem(path as any, fieldConfig.parse(value))
          }
        }
      }
    }

    for (const key in payload.item) {
      if (key in payload.model.relations) {
        const value = payload.item[key]
        if (value) {
          if (Array.isArray(value)) {
            for (const child of value as any[]) {
              parseNestedItem(payload.model, key, child)
            }
          }
          else {
            parseNestedItem(payload.model, key, value)
          }
        }
      }
    }
  })

  function parseNestedItem(parentModel: Model, key: string, child: any) {
    const relation = parentModel.relations![key]!
    const possibleModels = Object.keys(relation.to)
    const childModel = store.$getModel(child, possibleModels)
    if (!childModel) {
      throw new Error(`Could not determine for relation ${parentModel.name}.${String(key)}`)
    }
    store.$processItemParsing(childModel, child)
  }

  store.$hooks.hook('serializeItem', (payload) => {
    if (payload.model.fields) {
      for (const path in payload.model.fields) {
        const fieldConfig = payload.model.fields[path]!
        if (fieldConfig.serialize) {
          const value = get(payload.item, path as any)
          if (value != null) {
            payload.modifyItem(path as any, fieldConfig.serialize(value))
          }
        }
      }
    }
  })

  return store
}
