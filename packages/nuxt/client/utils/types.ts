import type { FindOptions } from '@rstore/shared'

export interface StoreHistoryItem {
  operation: 'fetchFirst' | 'fetchMany' | 'create' | 'update' | 'delete' | 'cacheWrite' | 'itemGarbageCollect' | 'cacheLayerAdd' | 'cacheLayerRemove'
  collection?: string
  key?: string | number
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
