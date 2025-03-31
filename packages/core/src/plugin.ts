import type { HookPayload, ModelDefaults, ModelList, Plugin, RegisteredPlugin, StoreCore } from '@rstore/shared'

const mergedModelDefaultsFields = [
  'computed',
  'meta',
] as Array<keyof ModelDefaults>

const deepMergedModelDefaultsFields = [
  'fields',
] as Array<keyof ModelDefaults>

export async function setupPlugin<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>(store: StoreCore<TModelList, TModelDefaults>, plugin: RegisteredPlugin) {
  await plugin.setup({
    hook(name, callback, options) {
      plugin.hooks[name] ??= []
      plugin.hooks[name].push({ callback, options })

      return store.$hooks.hook(name, (payload: HookPayload) => {
        // Plugin scoping to specific models with the same scopeId
        if (!options?.ignoreScope && plugin.scopeId && 'model' in payload && payload.model.scopeId && payload.model.scopeId !== plugin.scopeId) {
          return
        }
        return callback(payload as any)
      }, plugin)
    },

    addModelDefaults(modelDefaults) {
      for (const key of Object.keys(modelDefaults) as Array<keyof ModelDefaults>) {
        const value = modelDefaults[key] as any
        if (value) {
          if (mergedModelDefaultsFields.includes(key)) {
            if (!store.$modelDefaults[key]) {
              store.$modelDefaults[key] = {} as any
            }
            Object.assign(store.$modelDefaults[key] as any, value)
          }
          else if (deepMergedModelDefaultsFields.includes(key)) {
            if (!store.$modelDefaults[key]) {
              store.$modelDefaults[key] = {} as any
            }
            for (const fieldKey in value) {
              // @ts-expect-error typescript is annoying
              if (!store.$modelDefaults[key][fieldKey]) {
                // @ts-expect-error typescript is annoying
                store.$modelDefaults[key][fieldKey] = {} as any
              }
              Object.assign((store.$modelDefaults[key] as any)[fieldKey], value[fieldKey])
            }
          }
          else {
            store.$modelDefaults[key] = value
          }
        }
      }
    },
  })
}

export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}
