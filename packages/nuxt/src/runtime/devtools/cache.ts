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
    // Store injection may be absent when the watcher fires (e.g. app
    // errored before the rstore plugin ran) — bail out instead of throwing.
    const store = nuxtApp.$rstore
    if (!store) {
      return
    }
    watch(() => (store as any).$cache._private.layers.value, () => {
      cacheUpdated.trigger()
    }, {
      deep: true,
    })
  })
}
