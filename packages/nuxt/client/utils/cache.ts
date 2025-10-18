import type { Cache, CacheLayer } from '@rstore/shared'
import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

export const useStoreCache = createSharedComposable(() => {
  const store = useNonNullRstore()

  function getCache() {
    return toRaw(store.value.$cache.getState())
  }

  const cache = shallowRef(getCache())

  function getLayers(): CacheLayer[] {
    const cache = store.value.$cache as Cache & {
      _private: any
    }
    const layerMap = toRaw(cache._private.layers) as Record<string, Ref<CacheLayer[]>>
    const layers: CacheLayer[] = []
    for (const collectionLayersRef of Object.values(layerMap)) {
      const collectionLayers = collectionLayersRef.value
      for (const layer of collectionLayers) {
        layers.push(layer)
      }
    }
    return layers
  }

  const layers = shallowRef(getLayers())

  const client = useDevtoolsClient()
  client.value?.host.nuxt.$rstoreCacheUpdated?.on(() => {
    cache.value = { ...getCache() }
    layers.value = [...getLayers()]
  })

  return {
    cache,
    layers,
  }
})
