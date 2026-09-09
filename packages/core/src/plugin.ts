import type { Awaitable, CollectionDefaults, HookPayload, Plugin, PluginCategory, RegisteredPlugin, StoreCore, StoreSchema } from '@rstore/shared'

const mergedCollectionDefaultsFields = [
  'computed',
  'meta',
] as Array<keyof CollectionDefaults>

const deepMergedCollectionDefaultsFields = [
  'fields',
] as Array<keyof CollectionDefaults>

/**
 * Runs a plugin's `setup`, returning whatever it returned.
 *
 * Deliberately not an `async function`: that would wrap even a synchronous
 * `setup` in a promise, and the caller awaiting it would push every later
 * plugin into a microtask — where framework composables that need the
 * caller's synchronous context (Nuxt's `useNuxtApp`) no longer resolve.
 *
 * @param store Store the plugin is registered on.
 * @param plugin The plugin to set up.
 * @returns A promise when the plugin's `setup` is async, otherwise nothing.
 */
export function setupPlugin<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>(store: StoreCore<TSchema, TCollectionDefaults>, plugin: RegisteredPlugin): Awaitable<void> {
  return plugin.setup({
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
  const afterRelations = new Map<string, Set<string>>()

  /**
   * Records that one plugin must run before another.
   *
   * The depth-first traversal reads dependencies from the dependent plugin,
   * so this stores only that reverse adjacency.
   *
   * @param beforeName Plugin that must run first.
   * @param afterName Plugin that depends on it.
   */
  function addPluginOrder(beforeName: string, afterName: string): void {
    const dependencies = afterRelations.get(afterName)
    if (dependencies) {
      dependencies.add(beforeName)
    }
    else {
      afterRelations.set(afterName, new Set([beforeName]))
    }
  }

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
        addPluginOrder(plugin.name, beforeName)
      }
    }

    // Process 'after' relationships (highest priority)
    if (plugin.after?.plugins) {
      for (const afterName of plugin.after.plugins) {
        addPluginOrder(afterName, plugin.name)
      }
    }

    // Process 'before' category relationships (medium priority)
    if (plugin.before?.categories) {
      for (const beforeCategory of plugin.before.categories) {
        const categoryPlugins = pluginsByCategory.get(beforeCategory as PluginCategory) || []
        for (const p of categoryPlugins) {
          if (p.name !== plugin.name) {
            addPluginOrder(plugin.name, p.name)
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
            addPluginOrder(p.name, plugin.name)
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
        addPluginOrder(current.name, next.name)
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
