import type { CollectionDefaults, StoreSchema } from './collection.js'
import type { HookDefinitions } from './hooks.js'
import type { Awaitable } from './utils.js'

export interface CustomPluginMeta {
  description?: string
  builtin?: boolean
}

export type PluginCategory = 'virtual' | 'local' | 'remote' | 'processing'

export interface Plugin {
  /**
   * Helps to identify the adapter.
   */
  name: string

  /**
   * Category of the plugin.
   */
  category?: PluginCategory

  /**
   * Setups the adapter
   * @param api
   * @returns
   */
  setup: (api: PluginSetupApi) => Awaitable<void>

  /**
   * Allows scoping the plugin to specific collections with the same scopeId.
   *
   * This is useful when you have multiple data sources.
   */
  scopeId?: string

  /**
   * Sort the plugin after other plugins.
   */
  after?: {
    /**
     * List of plugin names that this plugin depends on.
     * The dependent plugins will be sorted before this plugin.
     */
    plugins?: string[]
    /**
     * Categories of plugins that should be sorted before this plugin.
     */
    categories?: Array<PluginCategory>
  }

  /**
   * Sort the plugin before other plugins.
   */
  before?: {
    /**
     * List of plugin names that should be sorted after this plugin.
     */
    plugins?: string[]
    /**
     * Categories of plugins that should be sorted after this plugin.
     */
    categories?: Array<PluginCategory>
  }

  meta?: CustomPluginMeta
}

export interface RegisteredPlugin extends Plugin {
  // eslint-disable-next-line ts/no-unsafe-function-type
  hooks: Record<string, Array<{ callback: Function, options?: HookPluginOptions }>>
}

export interface HookPluginOptions {
  /**
   * Allows the hook to be called with any collection, even with different scopeId.
   */
  ignoreScope?: boolean
}

export interface PluginSetupApi {
  /**
   * Add options to the collection defaults.
   */
  addCollectionDefaults: (collectionDefaults: CollectionDefaults) => void

  hook: <
    TName extends keyof HookDefinitions<StoreSchema, CollectionDefaults>,
  > (name: TName,
    callback: HookDefinitions<StoreSchema, CollectionDefaults>[TName],
    options?: HookPluginOptions
  ) => () => void
}
