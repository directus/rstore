import type { CollectionDefaults, HookPayload, Plugin, RegisteredPlugin, StoreCore, StoreSchema } from '@rstore/shared'

const mergedCollectionDefaultsFields = [
  'computed',
  'meta',
] as Array<keyof CollectionDefaults>

const deepMergedCollectionDefaultsFields = [
  'fields',
] as Array<keyof CollectionDefaults>

export async function setupPlugin<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(store: StoreCore<TSchema, TCollectionDefaults>, plugin: RegisteredPlugin) {
  await plugin.setup({
    hook(name, callback, options) {
      plugin.hooks[name] ??= []
      plugin.hooks[name].push({ callback, options })

      return store.$hooks.hook(name, (payload: HookPayload) => {
        // Plugin scoping to specific collections with the same scopeId
        if (!options?.ignoreScope && plugin.scopeId && 'collection' in payload && payload.collection.scopeId && payload.collection.scopeId !== plugin.scopeId) {
          return
        }
        return callback(payload as any)
      }, plugin)
    },

    addCollectionDefaults(collectionDefaults) {
      for (const key of Object.keys(collectionDefaults) as Array<keyof CollectionDefaults>) {
        const value = collectionDefaults[key] as any
        if (value) {
          if (mergedCollectionDefaultsFields.includes(key)) {
            if (!store.$collectionDefaults[key]) {
              store.$collectionDefaults[key] = {} as any
            }
            Object.assign(store.$collectionDefaults[key] as any, value)
          }
          else if (deepMergedCollectionDefaultsFields.includes(key)) {
            if (!store.$collectionDefaults[key]) {
              store.$collectionDefaults[key] = {} as any
            }
            for (const fieldKey in value) {
              // @ts-expect-error typescript is annoying
              if (!store.$collectionDefaults[key][fieldKey]) {
                // @ts-expect-error typescript is annoying
                store.$collectionDefaults[key][fieldKey] = {} as any
              }
              Object.assign((store.$collectionDefaults[key] as any)[fieldKey], value[fieldKey])
            }
          }
          else {
            store.$collectionDefaults[key] = value
          }
        }
      }
    },
  })
}

export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}
