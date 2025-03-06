import type { VueStore } from '@rstore/vue'
import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

export function useHostRstore() {
  const client = useDevtoolsClient()

  return computed(() => client.value?.host.nuxt.$rstore as VueStore<any, any>)
}

export function useNonNullRstore() {
  const store = useHostRstore()
  return computed(() => store.value!)
}

export function onRstoreCacheUpdated(cb: () => void) {
  const client = useDevtoolsClient()
  client.value?.host.nuxt.$rstoreCacheUpdated?.on(cb)
}
