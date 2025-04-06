import type { ResolvedModule } from '@rstore/shared'
import type { App, InjectionKey } from 'vue'
import type { VueStore } from './store'

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
