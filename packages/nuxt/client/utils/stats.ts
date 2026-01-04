import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

export function useStoreStats() {
  const client = useDevtoolsClient()

  const stats = computed(() => client.value?.host.nuxt.$rstoreDevtoolsStats())

  client.value?.host.nuxt.$rstoreHistoryUpdated?.on(() => {
    triggerRef(stats)
  })

  client.value?.host.nuxt.$rstoreSubscriptionsUpdated?.on(() => {
    triggerRef(stats)
  })

  return stats
}

export function clearStoreStats() {
  const client = useDevtoolsClient()
  client.value?.host.nuxt.$rstoreDevtoolsStatsClear()
}
