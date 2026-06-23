import type { ResolvedModule } from '@rstore/shared'
import type { ShallowRef } from 'vue'
import { createEventHook } from '@vueuse/core'
import { isRef, shallowRef, triggerRef, watch } from 'vue'

/** Register module state tracking for devtools. */
export function installModuleDevtoolsHooks(nuxtApp: any, hook: any) {
  if (!import.meta.client) {
    return
  }
  const modulesUpdated = nuxtApp.$rstoreModulesUpdated = createEventHook<void>()
  let modules: ShallowRef<Map<string, ResolvedModule<any, any>>> | undefined

  hook('init', (payload: any) => {
    modules = shallowRef(payload.store.$registeredModules)
    watch(() => snapshotModules(modules!), () => {
      modulesUpdated.trigger()
    }, {
      deep: true,
    })
  })

  hook('moduleResolved', (payload: any) => {
    modulesUpdated.trigger()
    if (modules) {
      modules.value = payload.store.$registeredModules
      triggerRef(modules)
    }
  })
}

function snapshotModules(modules: ShallowRef<Map<string, ResolvedModule<any, any>>>) {
  const result: Record<string, any> = {}
  for (const [moduleName, module] of modules.value.entries()) {
    const m = result[moduleName] = {
      state: module.$state,
    } as Record<string, any>
    for (const key in module) {
      if (key.startsWith('$')) {
        continue
      }
      m[key] = snapshotModuleValue(module[key])
    }
  }
  return result
}

function snapshotModuleValue(value: any) {
  if (value?.__brand === 'rstore-module-mutation') {
    return {
      $loading: value.$loading,
      $error: value.$error,
    }
  }
  if (value?.data && isRef(value.data) && value?.loading && isRef(value.loading) && value?.error && isRef(value.error)) {
    return {
      data: value.data.value,
      loading: value.loading.value,
      error: value.error.value,
    }
  }
  return isRef(value) ? value.value : value
}
