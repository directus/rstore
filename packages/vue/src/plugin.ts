import { type App, inject, type InjectionKey } from 'vue'
import { getActiveStore, type VueStore } from './store'

export interface RstoreVueGlobal {
  store: VueStore
}

export interface PluginOptions {
  store: VueStore
}

export const injectionKey = Symbol('rstore') as InjectionKey<RstoreVueGlobal>

export function install(vueApp: App, options: PluginOptions) {
  vueApp.provide(injectionKey, {
    store: options.store,
  })
}

export function useStore(): RstoreVueGlobal['store'] {
  const injected = inject(injectionKey, null)?.store ?? getActiveStore()
  if (!injected) {
    throw new Error('Rstore is not installed. Make sure to install the plugin with `app.use(RstorePlugin, { store })`. For tests, use `setActiveStore(store)`.')
  }
  return injected
}
