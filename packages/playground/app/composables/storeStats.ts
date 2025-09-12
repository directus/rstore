import type { FindOptions } from '@rstore/shared'

export interface StoreHistoryItem {
  operation: 'fetchFirst' | 'fetchMany' | 'create' | 'update' | 'delete'
  collection: string
  key?: string
  findOptions?: FindOptions<any, any, any>
  item?: any
  result: any
  started: Date
  ended: Date
  server?: boolean
}

export function useStoreStats() {
  return useState('rstore-stats', () => ({
    store: [] as StoreHistoryItem[],
  }))
}
