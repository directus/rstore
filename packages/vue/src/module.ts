import { defineModule as _defineModule } from '@rstore/core'
import { hasInjectionContext, inject } from 'vue'
import { injectionKey } from './plugin'

export const defineModule: typeof _defineModule = ((cb) => {
  return () => {
    const rstoreGlobal = hasInjectionContext() ? inject(injectionKey, undefined) : undefined

    if (rstoreGlobal) {
      // Reuse the module if it was already created
      if (rstoreGlobal.modules.has(cb)) {
        return rstoreGlobal.modules.get(cb)
      }

      // Create a new module and add it to the global store
      const module = _defineModule(cb)()
      rstoreGlobal.modules.set(cb, module)
      return module
    }

    return _defineModule(cb)()
  }
}) as typeof _defineModule
