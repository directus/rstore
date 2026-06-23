import type { RstoreDevtoolsClient } from '@rstore/devtools'

declare global {
  interface Window {
    __RSTORE_DEVTOOLS__?: RstoreDevtoolsClient
  }
}

/** Normalize VueUse event hook unsubscribe shapes. */
export function on(eventHook: { on: (callback: () => void) => { off: () => void } | (() => void) } | undefined, callback: () => void) {
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

/** Expose the devtools bridge on window for the iframe client. */
export function installDevtoolsClientBridge(nuxtApp: any) {
  if (!import.meta.client) {
    return
  }
  window.__RSTORE_DEVTOOLS__ = {
    getStore: () => nuxtApp.$rstore,
    getStats: () => nuxtApp.$rstoreDevtoolsStats?.(),
    clearStats: () => nuxtApp.$rstoreDevtoolsStatsClear?.(),
    onCacheUpdated: callback => on(nuxtApp.$rstoreCacheUpdated, callback),
    onHistoryUpdated: callback => on(nuxtApp.$rstoreHistoryUpdated, callback),
    onSubscriptionsUpdated: callback => on(nuxtApp.$rstoreSubscriptionsUpdated, callback),
    onModulesUpdated: callback => on(nuxtApp.$rstoreModulesUpdated, callback),
  }
}
