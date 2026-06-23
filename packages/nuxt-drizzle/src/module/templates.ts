import type { Nuxt } from '@nuxt/schema'
import type { Collection, CustomCollectionMeta } from '@rstore/shared'
import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { ModuleOptions } from './types'
import { addServerTemplate, addTemplate, addTypeTemplate, updateTemplates } from '@nuxt/kit'

/** Register templates generated from Drizzle collections. */
export function registerDrizzleTemplates({
  nuxt,
  drizzleSchemaPath,
  drizzleConfig,
  drizzleImport,
  getCollections,
}: {
  nuxt: Nuxt
  drizzleSchemaPath: string
  drizzleConfig: DrizzleKitConfig
  drizzleImport: ModuleOptions['drizzleImport']
  getCollections: () => Promise<Collection[]>
}) {
  addServerTemplate({
    filename: '$rstore-drizzle-server-utils.js',
    getContents: async () => createServerUtilsTemplate({
      drizzleSchemaPath,
      drizzleConfig,
      drizzleImport,
      collections: await getCollections(),
    }),
  })

  addTemplate({
    filename: '$rstore-drizzle-collections.js',
    getContents: async () => createCollectionsTemplate(await getCollections()),
  })

  addTypeTemplate({
    filename: '$rstore-drizzle-collections.d.ts',
    getContents: async () => createCollectionsTypeTemplate(drizzleSchemaPath, await getCollections()),
  })

  if (nuxt.options.dev) {
    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('dev:reload', () => {
        updateTemplates({
          filter: template => template.filename === '$rstore-drizzle-collections.js' || template.filename === '$rstore-drizzle-collections.d.ts',
        })
      })
    })
  }
}

/** Register generated collection and runtime plugin imports with @rstore/nuxt. */
export async function registerRstoreNuxtImports(nuxt: Nuxt, resolve: (path: string) => string) {
  const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')
  addCollectionImport(nuxt, '#build/$rstore-drizzle-collections.js')
  addPluginImport(nuxt, resolve('./runtime/plugin'))
  return { addPluginImport }
}

function createServerUtilsTemplate({
  drizzleSchemaPath,
  drizzleConfig,
  drizzleImport,
  collections,
}: {
  drizzleSchemaPath: string
  drizzleConfig: DrizzleKitConfig
  drizzleImport: ModuleOptions['drizzleImport']
  collections: Collection[]
}) {
  const collectionMetas: Record<string, CustomCollectionMeta | undefined> = {}
  const collectionRelations: Record<string, any> = {}
  for (const collection of collections) {
    collectionMetas[collection.name] = collection.meta
    collectionRelations[collection.name] = collection.relations ?? {}
  }

  return `import * as schema from '${drizzleSchemaPath}'
import { ${drizzleImport?.name ?? 'useDrizzle'} as _drizzleDefault } from '${drizzleImport?.from ?? '~~/server/utils/drizzle'}'

export const tables = schema
export const collectionMetas = ${JSON.stringify(collectionMetas, null, 2)}
export const collectionRelations = ${JSON.stringify(collectionRelations, null, 2)}
export const dialect = '${drizzleConfig.dialect}'
export const useDrizzles = {
  default: _drizzleDefault,
}`
}

function createCollectionsTemplate(collections: Collection[]) {
  return collections.map((collection, index) => {
    let code = `export const collection${index} = {`
    code += `name: '${collection.name}',`
    code += `scopeId: '${collection.scopeId}',`
    code += `meta: ${JSON.stringify(collection.meta)},`
    if (collection.relations) {
      code += `relations: ${JSON.stringify(collection.relations)},`
    }
    code += `getKey: (item) => ${collection.meta?.primaryKeys?.length ? `(${collection.meta.primaryKeys.map(key => `item.${key}`).join(` + '::' + `)})` : 'item.id'},`
    code += `}`
    return code
  }).join('\n')
}

function createCollectionsTypeTemplate(drizzleSchemaPath: string, collections: Collection[]) {
  return `import { withItemType } from '@rstore/vue'
import * as schema from '${drizzleSchemaPath}'

${collections.map((collection, index) => {
  let code = `export const collection${index} = withItemType<typeof schema.${collection.name}.$inferSelect>().defineCollection({`
  code += `name: '${collection.name}',`
  code += `meta: ${JSON.stringify(collection.meta)},`
  if (collection.relations) {
    code += `relations: ${JSON.stringify(collection.relations)},`
  }
  code += `})`
  return code
}).join('\n')}
`
}
