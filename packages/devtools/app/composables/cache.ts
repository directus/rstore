import type { Cache, CacheLayer } from '@rstore/shared'

import type { Ref } from 'vue'
import { createSharedComposable, tryOnScopeDispose } from '@vueuse/core'
import { shallowRef, toRaw } from 'vue'

import { useRstoreDevtoolsClient } from '../utils/rstore-devtools-plugin'
import { useNonNullRstore } from './rstore'

export const useStoreCache = createSharedComposable(() => {
  const client = useRstoreDevtoolsClient()
  const store = useNonNullRstore()

  function getCache() {
    return toRaw(store.value.$cache.getState())
  }

  function getLayers(): CacheLayer[] {
    const cache = store.value.$cache as Cache & {
      _private: {
        layers: Record<string, Ref<CacheLayer[]>>
      }
    }

    const layerMap = toRaw(cache._private.layers)
    const layers: CacheLayer[] = []

    for (const collectionLayersRef of Object.values(layerMap)) {
      for (const layer of collectionLayersRef.value) {
        layers.push(layer)
      }
    }

    return layers
  }

  const cache = shallowRef(getCache())
  const layers = shallowRef(getLayers())

  const stop = client.onCacheUpdated(() => {
    cache.value = { ...getCache() }
    layers.value = [...getLayers()]
  })

  if (typeof stop === 'function') {
    tryOnScopeDispose(stop)
  }

  return {
    cache,
    layers,
  }
})
