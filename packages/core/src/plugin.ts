import type { CollectionDefaults, HookPayload, Plugin, PluginCategory, RegisteredPlugin, StoreCore, StoreSchema } from '@rstore/shared'

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

const pluginCategories: PluginCategory[] = [
  'virtual',
  'local',
  'remote',
  'processing',
]

export function sortPlugins(plugins: RegisteredPlugin[]): RegisteredPlugin[] {
  const pluginByName = new Map<string, RegisteredPlugin>()
  const beforeRelations = new Map<string, Set<string>>()
  const afterRelations = new Map<string, Set<string>>()

  // Cache plugins by category for better performance
  const pluginsByCategory = new Map<PluginCategory, RegisteredPlugin[]>()
  for (const category of pluginCategories) {
    pluginsByCategory.set(category, plugins.filter(p => p.category === category))
  }

  // Process before/after relationships
  for (const plugin of plugins) {
    pluginByName.set(plugin.name, plugin)

    // Process 'before' relationships (highest priority)
    if (plugin.before?.plugins) {
      for (const beforeName of plugin.before.plugins) {
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

    // Process 'after' relationships (highest priority)
    if (plugin.after?.plugins) {
      for (const afterName of plugin.after.plugins) {
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

    // Process 'before' category relationships (medium priority)
    if (plugin.before?.categories) {
      for (const beforeCategory of plugin.before.categories) {
        const categoryPlugins = pluginsByCategory.get(beforeCategory as PluginCategory) || []
        for (const p of categoryPlugins) {
          if (p.name !== plugin.name) {
            if (!beforeRelations.has(plugin.name)) {
              beforeRelations.set(plugin.name, new Set())
            }
            beforeRelations.get(plugin.name)!.add(p.name)

            if (!afterRelations.has(p.name)) {
              afterRelations.set(p.name, new Set())
            }
            afterRelations.get(p.name)!.add(plugin.name)
          }
        }
      }
    }

    // Process 'after' category relationships (medium priority)
    if (plugin.after?.categories) {
      for (const afterCategory of plugin.after.categories) {
        const categoryPlugins = pluginsByCategory.get(afterCategory as PluginCategory) || []
        for (const p of categoryPlugins) {
          if (p.name !== plugin.name) {
            if (!afterRelations.has(plugin.name)) {
              afterRelations.set(plugin.name, new Set())
            }
            afterRelations.get(plugin.name)!.add(p.name)

            if (!beforeRelations.has(p.name)) {
              beforeRelations.set(p.name, new Set())
            }
            beforeRelations.get(p.name)!.add(plugin.name)
          }
        }
      }
    }
  }

  // Add default category ordering based on pluginCategories array (lowest priority)
  for (let i = 0; i < pluginCategories.length - 1; i++) {
    const currentCategory = pluginCategories[i]!
    const nextCategory = pluginCategories[i + 1]!

    const currentPlugins = pluginsByCategory.get(currentCategory) || []
    const nextPlugins = pluginsByCategory.get(nextCategory) || []

    for (const current of currentPlugins) {
      for (const next of nextPlugins) {
        if (!beforeRelations.has(current.name)) {
          beforeRelations.set(current.name, new Set())
        }
        beforeRelations.get(current.name)!.add(next.name)

        if (!afterRelations.has(next.name)) {
          afterRelations.set(next.name, new Set())
        }
        afterRelations.get(next.name)!.add(current.name)
      }
    }
  }

  // Topological sort using depth-first search
  const sorted: RegisteredPlugin[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const circularDependencies = new Set<string>()

  function visit(name: string, path: string[] = []) {
    if (visited.has(name))
      return true
    if (circularDependencies.has(name))
      return false
    if (visiting.has(name)) {
      const cycle = [...path, name].join(' -> ')
      console.warn(`[rstore] Circular dependency detected: ${cycle}`)
      circularDependencies.add(name)
      return false
    }

    visiting.add(name)
    path.push(name)

    // Process 'after' dependencies first (they should come before this plugin)
    const afterDeps = afterRelations.get(name)
    if (afterDeps) {
      for (const afterName of afterDeps) {
        if (pluginByName.has(afterName)) {
          if (!visit(afterName, [...path])) {
            // If we encounter a circular dependency, we'll still continue with other plugins
            // but skip this dependency
            console.warn(`[rstore] Skipping circular dependency from ${name} to ${afterName}`)
          }
        }
      }
    }

    visiting.delete(name)
    visited.add(name)

    const plugin = pluginByName.get(name)
    if (plugin) {
      sorted.push(plugin)
    }

    return true
  }

  // Process all plugins
  for (const plugin of plugins) {
    if (plugin.name && !visited.has(plugin.name)) {
      visit(plugin.name)
    }
  }

  // Handle any remaining plugins that weren't visited due to circular dependencies
  for (const plugin of plugins) {
    if (!sorted.includes(plugin)) {
      sorted.push(plugin)
    }
  }

  return sorted
}
