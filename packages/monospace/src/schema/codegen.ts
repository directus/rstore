import type { MonospaceCollectionDefinition } from './introspection'

/**
 * Options used by generated Monospace runtime config modules.
 */
export interface GenerateMonospaceRuntimeConfigOptions {
  /**
   * Monospace instance URL to expose in generated runtime code.
   */
  url: string

  /**
   * Monospace project identifier to expose in generated runtime code.
   */
  project: string

  /**
   * Optional runtime API key to expose in generated runtime code.
   */
  apiKey?: string

  /**
   * rstore plugin scope id for generated Monospace collections.
   */
  scopeId: string
}

/**
 * Options used to generate typed collection modules.
 */
export interface GenerateTypedCollectionsTemplateOptions {
  /**
   * Module specifier that exports generated Monospace item interfaces.
   */
  itemsImport?: string
}

/**
 * Generates the runtime collection template consumed by `@rstore/nuxt`.
 */
export function generateCollectionsTemplate(collections: MonospaceCollectionDefinition[]): string {
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
 * Generates TypeScript item interfaces from Monospace OpenAPI metadata.
 */
export function generateItemsTemplate(collections: MonospaceCollectionDefinition[]): string {
  return collections.map((collection) => {
    const fields = collection.itemFields.map((field) => {
      return `  ${tsPropertyName(field.name)}${field.optional ? '?' : ''}: ${field.type}`
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
  collections: MonospaceCollectionDefinition[],
  options: GenerateTypedCollectionsTemplateOptions = {},
): string {
  if (!collections.length) {
    return 'export {}\n'
  }

  const imports = collections.map(collection => collection.typeName).join(',\n  ')
  const itemsImport = options.itemsImport ?? '#build/$rstore-monospace-items'

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
export function generateConfigTemplate(options: GenerateMonospaceRuntimeConfigOptions): string {
  return `export const url = ${JSON.stringify(options.url)}
export const project = ${JSON.stringify(options.project)}
export const apiKey = ${JSON.stringify(options.apiKey)}
export const scopeId = ${JSON.stringify(options.scopeId)}
`
}

/**
 * Generates the runtime Vite virtual schema module.
 */
export function generateViteSchemaTemplate(collections: MonospaceCollectionDefinition[]): string {
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
 * Generates a Vite virtual Monospace rstore plugin module.
 */
export function generateMonospacePluginTemplate(options: GenerateMonospaceRuntimeConfigOptions): string {
  return `import { createMonospaceRestClient, createMonospaceRstorePlugin } from '@rstore/monospace'

export const monospace = createMonospaceRestClient({
  url: ${JSON.stringify(options.url)},
  project: ${JSON.stringify(options.project)},
  apiKey: ${JSON.stringify(options.apiKey)},
})

export const monospacePlugin = createMonospaceRstorePlugin({
  client: monospace,
  scopeId: ${JSON.stringify(options.scopeId)},
})

export default monospacePlugin
`
}

/**
 * Generates the Vite virtual module that re-exports schema and plugin modules.
 */
export function generateViteIndexTemplate(): string {
  return `export { schema } from 'virtual:rstore-monospace/schema'
export { monospace, monospacePlugin } from 'virtual:rstore-monospace/plugin'
`
}

/**
 * Generates TypeScript declarations for Vite virtual Monospace modules.
 */
export function generateViteDeclarations(collections: MonospaceCollectionDefinition[]): string {
  return `declare module 'virtual:rstore-monospace/schema' {
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

declare module 'virtual:rstore-monospace/plugin' {
  import type { MonospaceRestClient, createMonospaceRstorePlugin } from '@rstore/monospace'

  export const monospace: MonospaceRestClient
  export const monospacePlugin: ReturnType<typeof createMonospaceRstorePlugin>
  export default monospacePlugin
}

declare module 'virtual:rstore-monospace' {
  import type { MonospaceRestClient, createMonospaceRstorePlugin } from '@rstore/monospace'

  export const schema: typeof import('virtual:rstore-monospace/schema').schema
  export const monospace: MonospaceRestClient
  export const monospacePlugin: ReturnType<typeof createMonospaceRstorePlugin>
}
`
}

/**
 * Formats a field as a TypeScript property name.
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
