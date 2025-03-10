import type { ModelDefaults, ModelList, Plugin, StoreCore } from '@rstore/shared'

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
>(store: StoreCore<TModelList, TModelDefaults>, plugin: Plugin) {
  await plugin.setup({
    hook: store.hooks.hook,

    addModelDefaults(modelDefaults) {
      for (const key of Object.keys(modelDefaults) as Array<keyof ModelDefaults>) {
        const value = modelDefaults[key] as any
        if (value) {
          if (mergedModelDefaultsFields.includes(key)) {
            if (!store.modelDefaults[key]) {
              store.modelDefaults[key] = {} as any
            }
            Object.assign(store.modelDefaults[key] as any, value)
          }
          else if (deepMergedModelDefaultsFields.includes(key)) {
            if (!store.modelDefaults[key]) {
              store.modelDefaults[key] = {} as any
            }
            for (const fieldKey in value) {
              // @ts-expect-error typescript is annoying
              if (!store.modelDefaults[key][fieldKey]) {
                // @ts-expect-error typescript is annoying
                store.modelDefaults[key][fieldKey] = {} as any
              }
              Object.assign((store.modelDefaults[key] as any)[fieldKey], value[fieldKey])
            }
          }
          else {
            store.modelDefaults[key] = value
          }
        }
      }
    },
  })
}

export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}
