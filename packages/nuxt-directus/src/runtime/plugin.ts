import type { Plugin, PluginSetupApi } from '@rstore/shared'
// @ts-expect-error virtual module
import { scopeId, url } from '#build/$rstore-directus-config.js'
import { useNuxtApp } from '#imports'
import { createDirectusClient, createDirectusRstorePlugin } from '@rstore/directus'

const nuxtDirectusPlugin: Plugin = {
  name: 'rstore-directus',
  category: 'remote',
  scopeId,

  setup(api: PluginSetupApi) {
    const directus = createDirectusClient({ url })
    const directusPlugin = createDirectusRstorePlugin({
      client: directus,
      scopeId,
    })
    const nuxt = useNuxtApp()
    nuxt.$directus = directus
    directusPlugin.setup(api)
  },
}

export default nuxtDirectusPlugin
