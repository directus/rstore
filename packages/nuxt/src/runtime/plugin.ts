import type { ModelMap, Plugin } from '@rstore/shared'

import { defineNuxtPlugin } from '#app'
// @ts-expect-error virtual file
import * as _model from '#build/$rstore-model'
// @ts-expect-error virtual file
import * as _plugins from '#build/$rstore-plugins'

import { createStore } from '@rstore/vue'
import { markRaw } from 'vue'

export default defineNuxtPlugin(async (nuxtApp) => {
  let plugins = Object.values({ ..._plugins }) as Plugin[]
  const models = { ..._model } as ModelMap

  // Devtools
  if (import.meta.dev) {
    const { devtoolsPlugin } = await import('./devtools')
    plugins = [
      ...plugins,
      devtoolsPlugin,
    ]
  }

  const store = await createStore({
    plugins,
    models,
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
