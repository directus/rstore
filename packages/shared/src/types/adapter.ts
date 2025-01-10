import type { hooks } from '../hooks.js'
import type { Awaitable } from './util.js'

export interface Adapter {
  /**
   * Helps to identify the adapter.
   */
  name: string

  /**
   * Setups the adapter
   * @param api
   * @returns
   */
  setup: (api: AdapterSetupApi) => Awaitable<void>
}

export interface AdapterSetupApi {
  hooks: typeof hooks
  hook: typeof hooks.hook
}
