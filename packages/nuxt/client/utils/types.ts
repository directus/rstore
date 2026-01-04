import type { FindOptions } from '@rstore/shared'
import type { EventHook } from '@vueuse/core'

export interface StoreHistoryItem {
  operation: 'fetchFirst' | 'fetchMany' | 'create' | 'update' | 'delete' | 'cacheWrite' | 'itemGarbageCollect' | 'cacheLayerAdd' | 'cacheLayerRemove'
  collection?: string
  key?: string | number
  keys?: Array<string | number>
  findOptions?: FindOptions<any, any, any>
  item?: any
  result: any
  started?: Date | undefined
  ended: Date
  server?: boolean
}

export interface StoreSubscriptionItem {
  id: string
  collection: string
  key?: string | number
  findOptions?: FindOptions<any, any, any>
  started: Date
}

declare module '#app' {
  interface NuxtApp {
    $rstoreModulesUpdated: EventHook
    $rstoreCacheUpdated: EventHook
    $rstoreHistoryUpdated: EventHook
    $rstoreSubscriptionsUpdated: EventHook
    $rstoreDevtoolsStats: () => {
      history: StoreHistoryItem[]
      subscriptions: StoreSubscriptionItem[]
    }
    $rstoreDevtoolsStatsClear: () => void
  }
}
