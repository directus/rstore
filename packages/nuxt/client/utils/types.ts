import type { FindOptions } from '@rstore/shared'

export interface StoreHistoryItem {
  operation: 'fetchFirst' | 'fetchMany' | 'create' | 'update' | 'delete' | 'cacheWrite'
  model: string
  key?: string
  findOptions?: FindOptions<any, any, any>
  item?: any
  result: any
  started?: Date | undefined
  ended: Date
  server?: boolean
}
