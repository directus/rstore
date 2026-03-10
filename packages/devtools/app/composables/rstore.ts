import type { VueStore } from '@rstore/vue'

import { computed } from 'vue'

import { useRstoreDevtoolsClient } from '../utils/rstore-devtools-plugin'

export function useHostRstore() {
  const client = useRstoreDevtoolsClient()

  return computed(() => client.getStore() as VueStore<any, any> | undefined)
}

export function useNonNullRstore() {
  const store = useHostRstore()
  return computed(() => store.value!)
}
