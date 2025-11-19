import type { GlobalStoreType } from '@rstore/shared'
import type { App, InjectionKey } from 'vue'
import type { VueStore } from './store'
import { inject } from 'vue'
import { getActiveStore } from './store'

interface RstoreVueGlobal {
  store: GlobalStoreType
}

export interface PluginOptions {
  store: VueStore
}

export const injectionKey = Symbol('rstore') as InjectionKey<RstoreVueGlobal>

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
