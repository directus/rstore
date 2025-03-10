import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

export const useStoreCache = createSharedComposable(() => {
  const store = useNonNullRstore()

  function getCache() {
    return toRaw(store.value.$cache.getState())
  }

  const cache = shallowRef(getCache())

  const client = useDevtoolsClient()
  client.value?.host.nuxt.$rstoreCacheUpdated?.on(() => {
    cache.value = { ...getCache() }
  })

  return cache
})
