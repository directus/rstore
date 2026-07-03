import type { Plugin, PluginSetupApi } from '@rstore/shared'
// @ts-expect-error virtual module
import { apiKey, project, scopeId, url } from '#build/$rstore-monospace-config.js'
import { useNuxtApp } from '#imports'
import { createMonospaceRestClient, createMonospaceRstorePlugin } from '@rstore/monospace'

const nuxtMonospacePlugin: Plugin = {
  name: 'rstore-monospace',
  category: 'remote',
  scopeId,

  setup(api: PluginSetupApi) {
    const monospace = createMonospaceRestClient({
      apiKey,
      project,
      url,
    })
    const monospacePlugin = createMonospaceRstorePlugin({
      client: monospace,
      scopeId,
    })
    const nuxt = useNuxtApp()
    nuxt.$monospace = monospace
    monospacePlugin.setup(api)
  },
}

export default nuxtMonospacePlugin
