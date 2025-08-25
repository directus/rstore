import type { Cache, CustomHookMeta, FindOptions, Hooks, ModelDefaults, MutationSpecialProps, Plugin, ResolvedModel, StoreCore, StoreSchema } from '@rstore/shared'
import { get, set } from '@rstore/shared'
import { defaultFetchPolicy } from './fetchPolicy'
import { addModelRelations, isModelRelations, resolveModels } from './model'
import { createModule } from './module'
import { setupPlugin } from './plugin'

export interface CreateStoreCoreOptions<
  TSchema extends StoreSchema = StoreSchema,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache
  schema: TSchema
  modelDefaults?: TModelDefaults
  plugins?: Array<Plugin>
  hooks: Hooks<TSchema, TModelDefaults>
  findDefaults?: Partial<FindOptions<any, any, any>>
  isServer?: boolean
  transformStore?: (store: StoreCore<TSchema, TModelDefaults>) => StoreCore<TSchema, TModelDefaults>
}

export async function createStoreCore<
  TSchema extends StoreSchema = StoreSchema,
  TModelDefaults extends ModelDefaults = ModelDefaults,
>(options: CreateStoreCoreOptions<TSchema, TModelDefaults>): Promise<StoreCore<TSchema, TModelDefaults>> {
  // Create store

  const models = resolveModels(options.schema, options.modelDefaults)

  let store: StoreCore<TSchema, TModelDefaults> = {
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

  for (const item of options.schema) {
    if (isModelRelations(item)) {
      addModelRelations(store, item)
    }
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

  function parseNestedItem(parentModel: ResolvedModel, key: string, child: any) {
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
