import type { RstoreDevtoolsStats, StoreHistoryItem } from '@rstore/devtools'
import type { createEventHook } from '@vueuse/core'
import { useNuxtApp } from '#imports'
import { definePlugin } from '@rstore/vue'
import { installCacheDevtoolsHooks } from './cache'
import { installDevtoolsClientBridge } from './client'
import { installHistoryDevtoolsHooks } from './history'
import { installModuleDevtoolsHooks } from './modules'
import { useStoreStats } from './stats'
import { installSubscriptionDevtoolsHooks } from './subscriptions'

export const devtoolsPlugin = definePlugin({
  name: 'rstore-devtools',
  category: 'processing',
  meta: {
    builtin: true,
    description: 'Integrate with Nuxt Devtools',
  },
  setup({ hook }) {
    const storeStats = useStoreStats()
    const nuxtApp = useNuxtApp()
    installDevtoolsClientBridge(nuxtApp)
    installCacheDevtoolsHooks(nuxtApp, hook)
    installHistoryDevtoolsHooks(nuxtApp, hook, storeStats)
    installSubscriptionDevtoolsHooks(nuxtApp, hook, storeStats)
    installModuleDevtoolsHooks(nuxtApp, hook)
  },
})

declare module '#app' {
  interface NuxtApp {
    $rstoreModulesUpdated: ReturnType<typeof createEventHook>
    $rstoreCacheUpdated: ReturnType<typeof createEventHook>
    $rstoreHistoryUpdated: ReturnType<typeof createEventHook>
    $rstoreSubscriptionsUpdated: ReturnType<typeof createEventHook>
    $rstoreDevtoolsStats: () => RstoreDevtoolsStats
    $rstoreDevtoolsStatsClear: () => void
  }
}

declare module '@rstore/vue' {
  export interface CustomHookMeta {
    storeHistoryItem?: Pick<StoreHistoryItem, 'started'>
  }
}
