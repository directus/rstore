export interface CacheLayer {
  id: string
  state: Record<string, Record<string | number, any>>
  deletedItems: Record<string, Set<string | number>>
  skip?: boolean
  optimistic?: boolean
}
