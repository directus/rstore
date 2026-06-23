import { createEventHook } from '@vueuse/core'
import { watch } from 'vue'

/** Register cache update events consumed by Nuxt Devtools. */
export function installCacheDevtoolsHooks(nuxtApp: any, hook: any) {
  if (!import.meta.client) {
    return
  }
  const cacheUpdated = nuxtApp.$rstoreCacheUpdated = createEventHook<void>()
  hook('afterCacheWrite', () => {
    cacheUpdated.trigger()
  })
  hook('afterCacheReset', () => {
    cacheUpdated.trigger()
  })
  hook('cacheLayerAdd', () => {
    cacheUpdated.trigger()
  })
  hook('cacheLayerRemove', () => {
    cacheUpdated.trigger()
  })
  setTimeout(() => {
    watch(() => (nuxtApp.$rstore as any).$cache._private.layers.value, () => {
      cacheUpdated.trigger()
    }, {
      deep: true,
    })
  })
}
