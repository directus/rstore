import type { DirectusCollectionDefinition } from './introspection'
import { directusFieldToTsType } from './introspection'

/**
 * Options used by generated Directus runtime config modules.
 */
export interface GenerateDirectusRuntimeConfigOptions {
  /**
   * Directus API URL to expose in generated runtime code.
   */
  url: string

  /**
   * rstore plugin scope id for generated Directus collections.
   */
  scopeId: string
}

/**
 * Options used to generate typed collection modules.
 */
export interface GenerateTypedCollectionsTemplateOptions {
  /**
   * Module specifier that exports generated Directus item interfaces.
   */
  itemsImport?: string
}

/**
 * Generates the runtime collection template consumed by `@rstore/nuxt`.
 */
export function generateCollectionsTemplate(collections: DirectusCollectionDefinition[]): string {
  return collections.map((collection, index) => {
    return `export const collection${index} = {
  name: ${JSON.stringify(collection.name)},
  scopeId: ${JSON.stringify(collection.scopeId)},
  meta: ${JSON.stringify(collection.meta)},
  relations: ${JSON.stringify(collection.relations)},
  getKey: (item) => ${collection.getKeyExpression},
}`
  }).join('\n')
}

/**
 * Generates TypeScript item interfaces from Directus field metadata.
 */
export function generateItemsTemplate(collections: DirectusCollectionDefinition[]): string {
  return collections.map((collection) => {
    const fields = collection.directusFields.map((field) => {
      return `  ${tsPropertyName(field.field)}: ${directusFieldToTsType(field)}`
    }).join('\n')

    return `export interface ${collection.typeName} {
${fields}
}`
  }).join('\n\n')
}

/**
 * Generates typed collection declarations for Nuxt's virtual type system.
 */
export function generateTypedCollectionsTemplate(
  collections: DirectusCollectionDefinition[],
  options: GenerateTypedCollectionsTemplateOptions = {},
): string {
  if (!collections.length) {
    return 'export {}\n'
  }

  const imports = collections.map(collection => collection.typeName).join(',\n  ')
  const itemsImport = options.itemsImport ?? '#build/$rstore-directus-items'

  return `import { withItemType } from '@rstore/vue'
import type {
  ${imports}
} from '${itemsImport}'

${collections.map((collection, index) => {
  return `export const collection${index} = withItemType<${collection.typeName}>().defineCollection({
  name: ${JSON.stringify(collection.name)},
  scopeId: ${JSON.stringify(collection.scopeId)},
  meta: ${JSON.stringify(collection.meta)},
  relations: ${JSON.stringify(collection.relations)},
  getKey: (item) => ${collection.getKeyExpression},
})`
}).join('\n\n')}
`
}

/**
 * Generates the runtime config template.
 */
export function generateConfigTemplate(options: GenerateDirectusRuntimeConfigOptions): string {
  return `export const url = ${JSON.stringify(options.url)}
export const scopeId = ${JSON.stringify(options.scopeId)}
`
}

/**
 * Generates the runtime Vite virtual schema module.
 */
export function generateViteSchemaTemplate(collections: DirectusCollectionDefinition[]): string {
  const collectionExports = generateCollectionsTemplate(collections)
  const schemaItems = collections.map((_, index) => `collection${index}`).join(',\n  ')
  const collectionsSection = collectionExports ? `${collectionExports}\n\n` : ''

  return `${collectionsSection}export const schema = [
  ${schemaItems}
]

export default schema
`
}

/**
 * Generates a Vite virtual Directus rstore plugin module.
 */
export function generateDirectusPluginTemplate(options: GenerateDirectusRuntimeConfigOptions): string {
  return `import { createDirectusClient, createDirectusRstorePlugin } from '@rstore/directus'

export const directus = createDirectusClient({
  url: ${JSON.stringify(options.url)},
})

export const directusPlugin = createDirectusRstorePlugin({
  client: directus,
  scopeId: ${JSON.stringify(options.scopeId)},
})

export default directusPlugin
`
}

/**
 * Generates the Vite virtual module that re-exports schema and plugin modules.
 */
export function generateViteIndexTemplate(): string {
  return `export { schema } from 'virtual:rstore-directus/schema'
export { directus, directusPlugin } from 'virtual:rstore-directus/plugin'
`
}

/**
 * Generates TypeScript declarations for Vite virtual Directus modules.
 */
export function generateViteDeclarations(collections: DirectusCollectionDefinition[]): string {
  return `declare module 'virtual:rstore-directus/schema' {
  import type { Collection, StoreSchema } from '@rstore/vue'

${indent(generateItemsTemplate(collections), 2)}
${collections.map((collection, index) => {
  return `  export const collection${index}: Collection<${collection.typeName}> & {
    readonly '~type': undefined
    readonly '~item': ${collection.typeName}
    readonly name: ${JSON.stringify(collection.name)}
  }`
}).join('\n')}
  export const schema: ${collections.length ? `[${collections.map((_, index) => `typeof collection${index}`).join(', ')}]` : 'StoreSchema'}
  export default schema
}

declare module 'virtual:rstore-directus/plugin' {
  import type { DirectusRstoreClient, createDirectusRstorePlugin } from '@rstore/directus'

  export const directus: DirectusRstoreClient
  export const directusPlugin: ReturnType<typeof createDirectusRstorePlugin>
  export default directusPlugin
}

declare module 'virtual:rstore-directus' {
  import type { DirectusRstoreClient, createDirectusRstorePlugin } from '@rstore/directus'

  export const schema: typeof import('virtual:rstore-directus/schema').schema
  export const directus: DirectusRstoreClient
  export const directusPlugin: ReturnType<typeof createDirectusRstorePlugin>
}
`
}

/**
 * Formats a Directus field as a TypeScript property name.
 */
function tsPropertyName(name: string): string {
  return /^[A-Z_$][\w$]*$/i.test(name) ? name : JSON.stringify(name)
}

/**
 * Indents generated source lines.
 */
function indent(source: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return source
    .split('\n')
    .map(line => line ? `${prefix}${line}` : line)
    .join('\n')
}
