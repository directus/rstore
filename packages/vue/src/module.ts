import type { Awaitable, CreateModuleApi, GlobalStoreType, Module, ResolvedModule } from '@rstore/shared'
import type { VueStore } from './store'
import { defineModule as _defineModule } from '@rstore/core'
import { hasInjectionContext } from 'vue'
import { useStore } from './plugin'

type TStore = ReturnType<typeof useStore>

export function defineModule<
  const TModule extends Module,
  const TModuleExposed extends Record<string, any>,
>(
  name: TModule['name'],
  cb: (api: CreateModuleApi<TStore>) => TModuleExposed,
): (store?: TStore | null) => Awaitable<ResolvedModule<TModule, TModuleExposed>> & ResolvedModule<TModule, TModuleExposed> {
  return (_store) => {
    const hasContext = hasInjectionContext()

    const store = (hasContext ? useStore() : _store) as VueStore

    if (store) {
      // Reuse the module if it was already created
      if (store.$modulesCache.has(cb)) {
        return store.$modulesCache.get(cb)
      }

      // Create a new module and add it to the global store
      const module = _defineModule(store as unknown as GlobalStoreType, name, cb)()
      store.$modulesCache.set(cb, module)
      return module
    }
    else {
      // TODO active store for testing
      throw new Error('Rstore module used outside of a Vue component setup or without active store. Make sure to call this function inside a setup() function or with an active store.')
    }
  }
}
