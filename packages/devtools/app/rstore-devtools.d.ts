import type { VueStore } from '@rstore/vue'
import type { EventHook } from '@vueuse/core'
import type { RstoreDevtoolsStats } from '../src/types'

declare module '#app' {
  interface NuxtApp {
    $rstore: VueStore<any, any>
    $rstoreModulesUpdated: EventHook<void>
    $rstoreCacheUpdated: EventHook<void>
    $rstoreHistoryUpdated: EventHook<void>
    $rstoreSubscriptionsUpdated: EventHook<void>
    $rstoreDevtoolsStats: () => RstoreDevtoolsStats
    $rstoreDevtoolsStatsClear: () => void
  }
}

export {}
