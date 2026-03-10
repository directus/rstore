import { tryOnScopeDispose } from '@vueuse/core'
import { computed, triggerRef } from 'vue'

import { useRstoreDevtoolsClient } from '../utils/rstore-devtools-plugin'

export function useStoreStats() {
  const client = useRstoreDevtoolsClient()

  const stats = computed(() => client.getStats())

  const stopHistory = client.onHistoryUpdated(() => {
    triggerRef(stats)
  })

  const stopSubscriptions = client.onSubscriptionsUpdated(() => {
    triggerRef(stats)
  })

  if (typeof stopHistory === 'function') {
    tryOnScopeDispose(stopHistory)
  }

  if (typeof stopSubscriptions === 'function') {
    tryOnScopeDispose(stopSubscriptions)
  }

  return stats
}

export function clearStoreStats() {
  const client = useRstoreDevtoolsClient()
  client.clearStats()
}
