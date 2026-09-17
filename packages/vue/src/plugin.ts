import type { Awaitable, CollectionDefaults, GlobalStoreType, HookDefinitions, HookPluginOptions, Plugin, PluginSetupApi, StoreSchema } from '@rstore/shared'
import type { App, InjectionKey } from 'vue'
import type { VueStore } from './store'
import { definePlugin as defineCorePlugin } from '@rstore/core'
import { inject } from 'vue'
import { getActiveStore } from './store'

interface RstoreVueGlobal {
  store: GlobalStoreType
}

export interface PluginOptions {
  store: VueStore
}

export const injectionKey = Symbol('rstore') as InjectionKey<RstoreVueGlobal>

type VueHookCallback<TCallback> = TCallback extends (payload: infer TPayload) => infer TResult
  ? (payload: Omit<TPayload, 'store'> & { store: VueStore }) => TResult
  : never

export interface VuePluginSetupApi extends Omit<PluginSetupApi, 'hook'> {
  /** Registers a hook that receives the Vue store proxy. */
  hook: <TName extends keyof HookDefinitions<StoreSchema, CollectionDefaults>>(
    name: TName,
    callback: VueHookCallback<HookDefinitions<StoreSchema, CollectionDefaults>[TName]>,
    options?: HookPluginOptions,
  ) => () => void
}

export interface VuePlugin extends Omit<Plugin, 'setup'> {
  /** Installs plugin hooks against the Vue store proxy. */
  setup: (api: VuePluginSetupApi) => Awaitable<void>
}

/**
 * Defines a plugin for stores created by `@rstore/vue`.
 *
 * Vue wraps the core store before plugin setup, so hook callbacks receive the
 * collection proxy API in addition to the core store contract.
 */
export function definePlugin(plugin: VuePlugin): Plugin {
  return defineCorePlugin(plugin as unknown as Plugin)
}

export function install(vueApp: App, options: PluginOptions) {
  vueApp.provide(injectionKey, {
    store: options.store as unknown as GlobalStoreType,
  })
}

export function useStore(): GlobalStoreType {
  const injected = inject(injectionKey, null)?.store ?? getActiveStore() as unknown as GlobalStoreType
  if (!injected) {
    throw new Error('Rstore is not installed. Make sure to install the plugin with `app.use(RstorePlugin, { store })`. For tests, use `setActiveStore(store)`.')
  }
  return injected
}
