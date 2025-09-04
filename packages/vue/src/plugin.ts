import type { ResolvedModule } from '@rstore/shared'
import type { VueStore } from './store'
import { type App, inject, type InjectionKey } from 'vue'

export interface RstoreVueGlobal {
  modules: WeakMap<() => ResolvedModule<any, any>, ResolvedModule<any, any>>
  store: VueStore
}

export interface PluginOptions {
  store: VueStore
}

export const injectionKey = Symbol('rstore') as InjectionKey<RstoreVueGlobal>

export function install(vueApp: App, options: PluginOptions) {
  vueApp.provide(injectionKey, {
    modules: new WeakMap(),
    store: options.store,
  })
}

export function useStore(): RstoreVueGlobal['store'] {
  const injected = inject(injectionKey, null)
  if (!injected) {
    throw new Error('Rstore is not installed. Make sure to install the plugin with `app.use(RstorePlugin, { store })`.')
  }
  return injected.store
}
