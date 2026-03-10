export interface StoreHistoryItem {
  operation: 'fetchFirst' | 'fetchMany' | 'create' | 'update' | 'delete' | 'cacheWrite' | 'itemGarbageCollect' | 'cacheLayerAdd' | 'cacheLayerRemove'
  collection?: string
  key?: string | number
  keys?: Array<string | number>
  findOptions?: unknown
  item?: any
  result: any
  started?: Date
  ended: Date
  server?: boolean
}

export interface StoreSubscriptionItem {
  id: string
  collection: string
  key?: string | number
  findOptions?: unknown
  started: Date
}

export interface RstoreDevtoolsStats {
  history: StoreHistoryItem[]
  subscriptions: StoreSubscriptionItem[]
}

export interface RstoreDevtoolsClient {
  getStore: () => unknown
  getStats: () => RstoreDevtoolsStats | undefined
  clearStats: () => void
  onCacheUpdated: (callback: () => void) => void | (() => void)
  onHistoryUpdated: (callback: () => void) => void | (() => void)
  onSubscriptionsUpdated: (callback: () => void) => void | (() => void)
  onModulesUpdated: (callback: () => void) => void | (() => void)
}
