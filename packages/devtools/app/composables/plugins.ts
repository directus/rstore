import { createSharedComposable } from '@vueuse/core'
import { shallowRef } from 'vue'

import { useNonNullRstore } from './rstore'

export const useStorePlugins = createSharedComposable(() => {
  const store = useNonNullRstore()

  const plugins = shallowRef(store.value.$plugins)

  return plugins
})
