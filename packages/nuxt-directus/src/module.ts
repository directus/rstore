import type { DirectusCollection, DirectusField, DirectusRelation } from '@directus/sdk'
import { createDirectus, readCollections, readFieldsByCollection, readRelations, rest, staticToken } from '@directus/sdk'
import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { generateCollectionsTemplate, generateConfigTemplate, generateItemsTemplate, generateTypedCollectionsTemplate } from './codegen'
import { buildDirectusCollections } from './introspection'

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

    const scopeId = options.scopeId ?? 'rstore-directus'
    const directus = createDirectus(options.url)
      .with(rest())
      .with(staticToken(options.adminToken))

    const directusCollections = await directus.request(readCollections()) as DirectusCollection[]
    const fieldsPerCollection = await readFieldsPerCollection(directus, directusCollections)
    const relations = await directus.request(readRelations()) as DirectusRelation[]

    const collections = buildDirectusCollections({
      collections: directusCollections,
      fields: fieldsPerCollection,
      relations,
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

/**
 * Reads all Directus fields grouped by collection name.
 */
async function readFieldsPerCollection(
  directus: ReturnType<typeof createDirectus> & { request: (command: any) => Promise<unknown> },
  collections: DirectusCollection[],
): Promise<Map<string, DirectusField[]>> {
  const fieldsPerCollection = new Map<string, DirectusField[]>()
  await Promise.all(collections.map(async (collection) => {
    if (!collection.schema || collection.collection.startsWith('directus_')) {
      return
    }
    const fields = await directus.request(readFieldsByCollection(collection.collection)) as DirectusField[]
    fieldsPerCollection.set(collection.collection, fields)
  }))
  return fieldsPerCollection
}
