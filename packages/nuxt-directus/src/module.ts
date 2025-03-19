import type { DirectusCollection, DirectusField } from '@directus/sdk'
import type { Model } from '@rstore/shared'
import { authentication, createDirectus, readCollections, readFieldsByCollection, rest } from '@directus/sdk'
import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, installModule } from '@nuxt/kit'

export interface ModuleOptions {
  /**
   * Directus API URL
   */
  url?: string

  /**
   * Admin token for Directus API to introspect the model
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
    let collections = await directus.request(readCollections()) as Array<DirectusCollection>
    collections = collections.filter(collection => !collection.meta.hidden && !collection.meta.singleton)

    // TODO support singleton collections

    const fieldsPerCollection = new Map<string, Array<DirectusField>>()

    await Promise.all(collections.map(async (collection) => {
      const fields = await directus.request(readFieldsByCollection(collection.collection)) as Array<DirectusField>
      fieldsPerCollection.set(collection.collection, fields)
    }))

    const models: Array<Model> = collections.map((collection) => {
      return {
        name: collection.collection,
        meta: {
          scopeId: 'rstore-directus',
        },
        relations: {}, // TODO
      }
    })

    addTemplate({
      filename: '$rstore-directus-models.js',
      getContents: async () => {
        return `export default [${
          models.map((model) => {
            let code = `{`
            code += `name: '${model.name}',`
            code += `meta: ${JSON.stringify(model.meta)},`
            if (model.relations) {
              code += `relations: ${JSON.stringify(model.relations)},`
            }
            code += `}`
            return code
          }).join(',\n')
        }]`
      },
    })

    addTypeTemplate({
      filename: '$rstore-directus-models.d.ts',
      getContents: async () => {
        return `import { defineItemType } from '@rstore/vue'

${models.map((model) => {
  let code = `export interface ${model.name} {`
  const fields = fieldsPerCollection.get(model.name) ?? []
  for (const field of fields) {
    if (field.meta.hidden) {
      continue
    }

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
}).join('\n')}

export default [
  ${models.map((model) => {
    let code = `defineItemType<${model.name}>().model({`
    code += `name: '${model.name}',`
    code += `meta: ${JSON.stringify(model.meta)},`
    if (model.relations) {
      code += `relations: ${JSON.stringify(model.relations)},`
    }
    code += `} as const),`
    return code
  }).join('\n')}
]
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

    const { addModelImport, addPluginImport } = await import('@rstore/nuxt/api')

    addModelImport(nuxt, '#build/$rstore-directus-models.js')

    addPluginImport(nuxt, resolve('./runtime/plugin'))
  },
})
