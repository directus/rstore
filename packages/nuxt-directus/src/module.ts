import type { DirectusCollection, DirectusField } from '@directus/sdk'
import type { Collection } from '@rstore/shared'
import { authentication, createDirectus, readCollections, readFieldsByCollection, rest } from '@directus/sdk'
import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, installModule } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Directus API URL
   */
  url?: string

  /**
   * Admin token for Directus API to introspect the collection
   */
  adminToken?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'rstore-directus',
    configKey: 'rstoreDirectus',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // Add global types
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolve('./runtime/types.ts') })
    })

    if (!hasNuxtModule('@rstore/nuxt')) {
      await installModule('@rstore/nuxt')
    }

    if (!options.url) {
      console.error('Directus API URL is required')
      return
    }
    if (!options.adminToken) {
      console.error('Directus API admin token is required')
      return
    }

    const directus = createDirectus(options.url)
      .with(rest())
      .with(authentication('json'))

    await directus.setToken(options.adminToken)

    // Introspect the collections
    let directusCollections = await directus.request(readCollections()) as Array<DirectusCollection>
    directusCollections = directusCollections.filter(collection => !collection.meta.hidden && !collection.meta.singleton && !!collection.schema)

    // TODO support singleton collections

    const fieldsPerCollection = new Map<string, Array<DirectusField>>()

    await Promise.all(directusCollections.map(async (collection) => {
      const fields = await directus.request(readFieldsByCollection(collection.collection)) as Array<DirectusField>
      fieldsPerCollection.set(collection.collection, fields)
    }))

    const collections: Array<Collection> = directusCollections.map((collection) => {
      return {
        '~type': 'collection',
        'name': collection.collection,
        'scopeId': 'rstore-directus',
        'meta': {
        },
        'relations': {}, // TODO
      }
    })

    addTemplate({
      filename: '$rstore-directus-collections.js',
      getContents: async () => {
        return `${
          collections.map((collection, index) => {
            let code = `export const collection${index} = {`
            code += `name: '${collection.name}',`
            code += `scopeId: '${collection.scopeId}',`
            code += `meta: ${JSON.stringify(collection.meta)},`
            if (collection.relations) {
              code += `relations: ${JSON.stringify(collection.relations)},`
            }
            code += `}`
            return code
          }).join('\n')
        }`
      },
    })

    addTypeTemplate({
      filename: '$rstore-directus-items.d.ts',
      getContents: async () => {
        return `${collections.map((collection) => {
          let code = `export interface ${collection.name} {`
          const fields = fieldsPerCollection.get(collection.name) ?? []
          for (const field of fields) {
            let type = 'any'
            switch (field.type) {
              case 'string':
              case 'uuid':
                type = 'string'
                break
              case 'integer':
                type = 'number'
                break
              case 'boolean':
                type = 'boolean'
                break
            }

            code += `\n  ${field.field}: ${type}`
          }
          code += '}'
          return code
        }).join('\n')}`
      },
    })

    addTypeTemplate({
      filename: '$rstore-directus-collections.d.ts',
      getContents: async () => {
        return `import { withItemType } from '@rstore/vue'

import {${collections.map(collection => collection.name).join(',\n')}} from '#build/$rstore-directus-items'

${collections.map((collection, index) => {
  let code = `export const collection${index} = withItemType<${collection.name}>().defineCollection({`
  code += `name: '${collection.name}',`
  code += `meta: ${JSON.stringify(collection.meta)},`
  if (collection.relations) {
    code += `relations: ${JSON.stringify(collection.relations)},`
  }
  code += `}),`
  return code
}).join('\n')}
`
      },
    })

    // Add auto imports
    addImportsDir(resolve('./runtime/utils'))

    // Runtime config
    addTemplate({
      filename: '$rstore-directus-config.js',
      getContents: () => `export const url = ${JSON.stringify(options.url)}\n`,
    })

    const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')

    addCollectionImport(nuxt, '#build/$rstore-directus-collections.js')

    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
