import type { Model, Plugin } from '@rstore/shared'

import { defineNuxtPlugin } from '#app'
// @ts-expect-error virtual file
import * as _model from '#build/$rstore-model'
// @ts-expect-error virtual file
import * as _plugins from '#build/$rstore-plugins'
import { createStore } from '@rstore/vue'

export default defineNuxtPlugin(async (nuxtApp) => {
  const plugins = Object.values({ ..._plugins }) as Plugin[]
  const model = { ..._model } as Model

  const store = await createStore({
    plugins,
    model,
  })

  const cacheKey = '$svanilla-rstore'

  nuxtApp.hook('app:rendered', () => {
    nuxtApp.payload.state[cacheKey] = markRaw(store.cache.getState())
  })

  if (import.meta.client && nuxtApp.payload.state[cacheKey]) {
    store.cache.setState(nuxtApp.payload.state[cacheKey])
  }

  // Inject $rstore
  return {
    provide: {
      rstore: store,
    },
  }
})
