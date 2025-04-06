import type { ModelList, Plugin } from '@rstore/shared'

import { defineNuxtPlugin } from '#app'
// @ts-expect-error virtual file
import _models from '#build/$rstore-model'
// @ts-expect-error virtual file
import * as _plugins from '#build/$rstore-plugins'

import { createStore, RstorePlugin } from '@rstore/vue'
import { markRaw } from 'vue'

export default defineNuxtPlugin(async (nuxtApp) => {
  let plugins = Object.values({ ..._plugins }) as Plugin[]
  const models = _models as ModelList

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
    isServer: !!import.meta.server,
  })

  const cacheKey = '$srstore'

  nuxtApp.hook('app:rendered', () => {
    nuxtApp.payload.state[cacheKey] = markRaw(store.$cache.getState())
  })

  if (import.meta.client && nuxtApp.payload.state[cacheKey]) {
    store.$cache.setState(nuxtApp.payload.state[cacheKey])
  }

  nuxtApp.vueApp.use(RstorePlugin, {
    store,
  })

  // Inject $rstore
  return {
    provide: {
      rstore: store,
    },
  }
})
