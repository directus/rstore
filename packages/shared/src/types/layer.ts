export interface CacheLayer {
  id: string
  collectionName: string
  state: Record<string | number, any>
  deletedItems: Set<string | number>
  skip?: boolean
  optimistic?: boolean
  prevent?: Partial<Record<'update' | 'delete', boolean>>
}
