import type { CollectionDefaults, StoreSchema } from './collection.js'
import type { HookDefinitions } from './hooks.js'
import type { Awaitable } from './utils.js'

export interface CustomPluginMeta {
  description?: string
  builtin?: boolean
}

export interface Plugin {
  /**
   * Helps to identify the adapter.
   */
  name: string

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
   * List of plugin names that this plugin depends on.
   * The dependent plugins will be sorted before this plugin.
   */
  after?: string[]

  /**
   * List of plugin names that should be sorted after this plugin.
   */
  before?: string[]

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
