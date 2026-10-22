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

    let ssrDevtools: import('./devtools/request').SSRRequestHandle | undefined
    if (import.meta.dev && devtoolsOptions) {
      if (import.meta.server) {
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
    }
    catch (error) {
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

    if (import.meta.dev && import.meta.client && devtoolsOptions) {
      const controller = new AbortController()
      let browserDevtools: { dispose: () => void } | undefined
      /** End optional discovery and instrumentation with this plugin lifetime. */
      const dispose = () => {
        controller.abort()
        browserDevtools?.dispose()
      }
      nuxtApp.vueApp.onUnmount(dispose)
      if (import.meta.hot)
        import.meta.hot.dispose(dispose)
      // Optional HTTP discovery cannot delay store creation, hydration or provision.
      void import('./devtools/browser').then(async ({ createNuxtBrowserDevtools }) => {
        if (controller.signal.aborted)
          return
        const handle = await createNuxtBrowserDevtools(devtoolsOptions, store, nuxtApp.$config.app.baseURL, controller.signal)
        if (controller.signal.aborted)
          handle.dispose()
        else
          browserDevtools = handle
      }).catch((error) => {
        if (!controller.signal.aborted)
          console.warn('rstore devtools unavailable:', error)
      })
    }

    // Inject $rstore
    return {
      provide: {
        rstore: store,
      },
    }
  },
})
