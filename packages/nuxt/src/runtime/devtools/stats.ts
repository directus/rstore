import type { StoreHistoryItem, StoreSubscriptionItem } from '@rstore/devtools'
import { useState } from '#imports'

/** Return the shared devtools stats state. */
export function useStoreStats() {
  return useState('$rstore-devtools-stats', () => ({
    history: [] as StoreHistoryItem[],
    subscriptions: [] as StoreSubscriptionItem[],
  }))
}

/** Convert function-valued options into strings for display. */
export function convertFunctionsToString(obj: Record<string, any> | undefined) {
  if (!obj) {
    return obj
  }
  const result: Record<string, any> = {}
  for (const key in obj) {
    result[key] = typeof obj[key] === 'function' ? obj[key].toString() : obj[key]
  }
  return result
}
