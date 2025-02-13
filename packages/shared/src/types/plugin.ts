import type { Hooks } from '../utils/hooks.js'
import type { Model, ModelDefaults } from './model.js'
import type { Awaitable } from './utils.js'

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
}

export interface PluginSetupApi {
  hook: Hooks<Model, ModelDefaults>['hook']
}
