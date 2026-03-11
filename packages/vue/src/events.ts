import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'

export const realtimeReconnectEventHook = createEventHook()

export const cacheWriteEventHook = createEventHook<{
  collection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  key?: string | number
  result?: Array<any>
  operation: 'write' | 'delete'
}>()
