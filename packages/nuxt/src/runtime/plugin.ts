import type { Plugin, StoreSchema } from '@rstore/shared'

import { defineNuxtPlugin } from '#app'
// @ts-expect-error virtual file
import options from '#build/$restore-options'
// @ts-expect-error virtual file
import _schema from '#build/$rstore-model'
// @ts-expect-error virtual file
import * as _plugins from '#build/$rstore-plugins'

import { createStore, RstorePlugin } from '@rstore/vue'
import { markRaw } from 'vue'

export default defineNuxtPlugin({
  name: 'rstore',

  order: -21,

  setup: async (nuxtApp) => {
    let plugins = Object.values({ ..._plugins }) as Plugin[]
    const schema = _schema as StoreSchema

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
      schema,
      isServer: !!import.meta.server,
      ...options,
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
  },
})
