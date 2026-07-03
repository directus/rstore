import { createEventHook } from '@vueuse/core'

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
}
