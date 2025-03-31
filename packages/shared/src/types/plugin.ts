import type { HookDefinitions } from './hooks.js'
import type { ModelDefaults, ModelList } from './model.js'
import type { Awaitable } from './utils.js'

export interface CustomPluginMeta {
  // empty
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
   * Allows scoping the plugin to specific models with the same scopeId.
   *
   * This is useful when you have multiple data sources.
   */
  scopeId?: string

  meta?: CustomPluginMeta
}

export interface HookPluginOptions {
  /**
   * Allows the hook to be called with any model, even with different scopeId.
   */
  ignoreScope?: boolean
}

export interface PluginSetupApi {
  /**
   * Add options to the model defaults.
   */
  addModelDefaults: (modelDefaults: ModelDefaults) => void

  hook: <
    TName extends keyof HookDefinitions<ModelList, ModelDefaults>,
  > (name: TName,
    callback: HookDefinitions<ModelList, ModelDefaults>[TName],
    options?: HookPluginOptions
  ) => () => void
}
