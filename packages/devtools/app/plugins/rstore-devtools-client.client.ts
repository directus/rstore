import type { RstoreDevtoolsClient } from '../../src/types'

import { defineNuxtPlugin } from '#imports'
import { useDevtoolsClient } from '@nuxt/devtools-kit/iframe-client'

import { createRstoreDevtoolsPlugin } from '../utils/rstore-devtools-plugin'

function on(eventHook: { on: (callback: () => void) => { off: () => void } | (() => void) } | undefined, callback: () => void) {
  const result = eventHook?.on(callback)
  if (!result) {
    return
  }

  if (typeof result === 'function') {
    return result
  }

  return () => {
    result.off()
  }
}

function getStandaloneClient() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    if (!window.parent || window.parent === window) {
      return undefined
    }

    return (window.parent as Window & { __RSTORE_DEVTOOLS__?: RstoreDevtoolsClient }).__RSTORE_DEVTOOLS__
  }
  catch {
    return undefined
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const client = useDevtoolsClient()
  const standaloneClient = getStandaloneClient()

  const devtoolsClient: RstoreDevtoolsClient = {
    getStore: () => client.value?.host.nuxt.$rstore ?? standaloneClient?.getStore(),
    getStats: () => client.value?.host.nuxt.$rstoreDevtoolsStats() ?? standaloneClient?.getStats(),
    clearStats: () => {
      if (client.value?.host.nuxt) {
        client.value.host.nuxt.$rstoreDevtoolsStatsClear()
      }
      else {
        standaloneClient?.clearStats()
      }
    },
    onCacheUpdated: callback => on(client.value?.host.nuxt.$rstoreCacheUpdated, callback) || standaloneClient?.onCacheUpdated(callback),
    onHistoryUpdated: callback => on(client.value?.host.nuxt.$rstoreHistoryUpdated, callback) || standaloneClient?.onHistoryUpdated(callback),
    onSubscriptionsUpdated: callback => on(client.value?.host.nuxt.$rstoreSubscriptionsUpdated, callback) || standaloneClient?.onSubscriptionsUpdated(callback),
    onModulesUpdated: callback => on(client.value?.host.nuxt.$rstoreModulesUpdated, callback) || standaloneClient?.onModulesUpdated(callback),
  }

  nuxtApp.vueApp.use(createRstoreDevtoolsPlugin(devtoolsClient))
})
