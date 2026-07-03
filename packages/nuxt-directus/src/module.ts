import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { DEFAULT_DIRECTUS_SCOPE_ID } from '@rstore/directus'
import {
  generateCollectionsTemplate,
  generateConfigTemplate,
  generateItemsTemplate,
  generateTypedCollectionsTemplate,
  loadDirectusCollections,
} from '@rstore/directus/schema'

export interface ModuleOptions {
  /**
   * Directus API URL.
   */
  url?: string

  /**
   * Admin token for build-time Directus introspection.
   */
  adminToken?: string

  /**
   * rstore plugin scope id for generated Directus collections.
   *
   * @default 'rstore-directus'
   */
  scopeId?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'rstore-directus',
    configKey: 'rstoreDirectus',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  moduleDependencies: {
    '@rstore/nuxt': {},
  },
  async setup(options, nuxt) {
    const log = useLogger('rstore-directus')
    const { resolve } = createResolver(import.meta.url)

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/types.ts') })
    })

    if (!options.url || !options.adminToken) {
      log.warn('Directus URL and admin token are required; skipping Directus collection generation')
      return
    }

    const scopeId = options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID
    const collections = await loadDirectusCollections({
      url: options.url,
      adminToken: options.adminToken,
      scopeId,
    })

    addTemplate({
      filename: '$rstore-directus-collections.js',
      getContents: () => generateCollectionsTemplate(collections),
    })

    addTypeTemplate({
      filename: '$rstore-directus-items.d.ts',
      getContents: () => generateItemsTemplate(collections),
    })

    addTypeTemplate({
      filename: '$rstore-directus-collections.d.ts',
      getContents: () => generateTypedCollectionsTemplate(collections),
    })

    addImportsDir(resolve('./runtime/utils'))

    addTemplate({
      filename: '$rstore-directus-config.js',
      getContents: () => generateConfigTemplate({ url: options.url!, scopeId }),
    })

    const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')

    addCollectionImport(nuxt, '#build/$rstore-directus-collections.js')
    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
