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

export function sortPlugins(plugins: RegisteredPlugin[]): RegisteredPlugin[] {
  const pluginByName = new Map<string, RegisteredPlugin>()
  const beforeRelations = new Map<string, Set<string>>()
  const afterRelations = new Map<string, Set<string>>()

  // Process before/after relationships
  for (const plugin of plugins) {
    pluginByName.set(plugin.name, plugin)

    // Process 'before' relationships
    if (plugin.before) {
      for (const beforeName of plugin.before) {
        if (!beforeRelations.has(plugin.name)) {
          beforeRelations.set(plugin.name, new Set())
        }
        beforeRelations.get(plugin.name)!.add(beforeName)

        if (!afterRelations.has(beforeName)) {
          afterRelations.set(beforeName, new Set())
        }
        afterRelations.get(beforeName)!.add(plugin.name)
      }
    }

    // Process 'after' relationships
    if (plugin.after) {
      for (const afterName of plugin.after) {
        if (!afterRelations.has(plugin.name)) {
          afterRelations.set(plugin.name, new Set())
        }
        afterRelations.get(plugin.name)!.add(afterName)

        if (!beforeRelations.has(afterName)) {
          beforeRelations.set(afterName, new Set())
        }
        beforeRelations.get(afterName)!.add(plugin.name)
      }
    }
  }

  // Topological sort using depth-first search
  const sorted: RegisteredPlugin[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string) {
    if (visited.has(name))
      return
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected for plugin ${name}`)
    }

    visiting.add(name)

    // Process 'after' dependencies first (they should come before this plugin)
    const afterDeps = afterRelations.get(name)
    if (afterDeps) {
      for (const afterName of afterDeps) {
        if (pluginByName.has(afterName)) {
          visit(afterName)
        }
      }
    }

    visiting.delete(name)
    visited.add(name)

    const plugin = pluginByName.get(name)
    if (plugin) {
      sorted.push(plugin)
    }
  }

  // Process all plugins
  for (const plugin of plugins) {
    if (plugin.name && !visited.has(plugin.name)) {
      visit(plugin.name)
    }
  }

  return sorted
}
