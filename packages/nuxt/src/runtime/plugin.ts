import type { Plugin, StoreSchema } from '@rstore/shared'

import { defineNuxtPlugin } from '#imports'
// @ts-expect-error virtual file
import _schema from '#rstore-collection'
// @ts-expect-error virtual file
import devtoolsOptions from '#rstore-devtools'
// @ts-expect-error virtual file
import options from '#rstore-options'
// @ts-expect-error virtual file
import * as _plugins from '#rstore-plugins'

import { createStore, RstorePlugin } from '@rstore/vue'
import { markRaw } from 'vue'

export default defineNuxtPlugin({
  name: 'rstore',

  order: -21,

  setup: async (nuxtApp) => {
    let plugins = Object.values({ ..._plugins }) as Plugin[]
    const schema = _schema as StoreSchema

    let browserDevtools: { dispose: () => void } | undefined
    let ssrDevtools: import('./devtools/request').SSRRequestHandle | undefined
    if (import.meta.dev && devtoolsOptions) {
      if (import.meta.client) {
        try {
          const { createNuxtBrowserDevtools } = await import('./devtools/browser')
          const handle = await createNuxtBrowserDevtools(devtoolsOptions, nuxtApp.$config.app.baseURL)
          browserDevtools = handle
          plugins = [...plugins, handle.plugin]
        }
        catch (error) {
          console.warn('rstore devtools unavailable:', error)
        }
      }
      else if (import.meta.server) {
        const { beginRstoreSSR } = await import('./devtools/server')
        ssrDevtools = beginRstoreSSR(nuxtApp, nuxtApp.ssrContext?.runtimeConfig?.rstoreDevtoolsSSR)
        if (ssrDevtools)
          plugins = [...plugins, ssrDevtools.plugin]
      }
    }

    let store: Awaited<ReturnType<typeof createStore>>
    try {
      store = await createStore({
        plugins,
        schema,
        isServer: !!import.meta.server,
        ...options,
      })
      ssrDevtools?.bindStore(store)
      nuxtApp.vueApp.onUnmount(() => browserDevtools?.dispose())
    }
    catch (error) {
      browserDevtools?.dispose()
      ssrDevtools?.finalize('error', error)
      throw error
    }

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
