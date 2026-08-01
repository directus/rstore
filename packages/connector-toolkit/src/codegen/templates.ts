import { indent, tsPropertyName } from './identifiers'

/**
 * Minimal collection shape consumed by the shared codegen templates.
 */
export interface CodegenCollection {
  /**
   * rstore collection name.
   */
  name: string

  /**
   * rstore plugin scope id assigned to the collection.
   */
  scopeId: string

  /**
   * Generated connector collection metadata.
   */
  meta: Record<string, any>

  /**
   * Generated rstore relations.
   */
  relations: Record<string, any>

  /**
   * JavaScript expression used by generated `getKey`.
   */
  getKeyExpression: string

  /**
   * TypeScript interface name generated for the collection item.
   */
  typeName: string
}

/**
 * One rendered field of a generated item interface.
 */
export interface RenderedItemField {
  /**
   * Item field name.
   */
  name: string

  /**
   * Rendered TypeScript type.
   */
  type: string

  /**
   * Whether the field is optional.
   */
  optional?: boolean
}

/**
 * Connector-specific names used by generated Vite virtual modules.
 */
export interface VirtualModuleNames {
  /**
   * Base virtual module id (for example `virtual:rstore-directus`).
   */
  virtualId: string

  /**
   * Exported client binding name (for example `directus`).
   */
  clientBinding: string

  /**
   * Exported rstore plugin binding name (for example `directusPlugin`).
   */
  pluginBinding: string

  /**
   * Connector package name (for example `@rstore/directus`).
   */
  packageName: string

  /**
   * Exported client TypeScript type name (for example `DirectusRstoreClient`).
   */
  clientTypeName: string

  /**
   * Exported plugin factory name (for example `createDirectusRstorePlugin`).
   */
  pluginFactoryName: string
}

/**
 * Options accepted by {@link generateTypedCollectionsTemplate}.
 */
export interface GenerateTypedCollectionsTemplateOptions {
  /**
   * Module specifier that exports generated item interfaces.
   */
  itemsImport: string
}

/**
 * Options accepted by {@link generateViteDeclarations}.
 */
export interface GenerateViteDeclarationsOptions<TCollection extends CodegenCollection> {
  /**
   * Returns the rendered item interface fields of a collection.
   */
  getFields: (collection: TCollection) => RenderedItemField[]

  /**
   * Whether to declare the literal `relations` type on each collection.
   */
  includeRelationsLine?: boolean
}

/**
 * Generates the runtime collection template consumed by `@rstore/nuxt`.
 */
export function generateCollectionsTemplate(collections: CodegenCollection[]): string {
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
 * Generates TypeScript item interfaces from connector field metadata.
 */
export function generateItemsTemplate<TCollection extends CodegenCollection>(
  collections: TCollection[],
  getFields: (collection: TCollection) => RenderedItemField[],
): string {
  return collections.map((collection) => {
    const fields = getFields(collection).map((field) => {
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
  collections: CodegenCollection[],
  options: GenerateTypedCollectionsTemplateOptions,
): string {
  if (!collections.length) {
    return 'export {}\n'
  }

  const imports = collections.map(collection => collection.typeName).join(',\n  ')

  return `import { withItemType } from '@rstore/vue'
import type {
  ${imports}
} from ${JSON.stringify(options.itemsImport)}

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
 * Generates the runtime Vite virtual schema module.
 */
export function generateViteSchemaTemplate(collections: CodegenCollection[]): string {
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
 * Generates the Vite virtual module that re-exports schema and plugin modules.
 */
export function generateViteIndexTemplate(names: VirtualModuleNames): string {
  return `export { schema } from '${names.virtualId}/schema'
export { ${names.clientBinding}, ${names.pluginBinding} } from '${names.virtualId}/plugin'
`
}

/**
 * Generates TypeScript declarations for Vite virtual connector modules.
 */
export function generateViteDeclarations<TCollection extends CodegenCollection>(
  collections: TCollection[],
  names: VirtualModuleNames,
  options: GenerateViteDeclarationsOptions<TCollection>,
): string {
  return `declare module '${names.virtualId}/schema' {
  import type { Collection, StoreSchema } from '@rstore/vue'

${indent(generateItemsTemplate(collections, options.getFields), 2)}
${collections.map((collection, index) => {
  const relationsLine = options.includeRelationsLine
    ? `\n    readonly relations: ${JSON.stringify(collection.relations)}`
    : ''
  return `  export const collection${index}: Collection<${collection.typeName}> & {
    readonly '~type': undefined
    readonly '~item': ${collection.typeName}
    readonly name: ${JSON.stringify(collection.name)}${relationsLine}
  }`
}).join('\n')}
  export const schema: ${collections.length ? `[${collections.map((_, index) => `typeof collection${index}`).join(', ')}]` : 'StoreSchema'}
  export default schema
}

declare module '${names.virtualId}/plugin' {
  import type { ${names.clientTypeName}, ${names.pluginFactoryName} } from '${names.packageName}'

  export const ${names.clientBinding}: ${names.clientTypeName}
  export const ${names.pluginBinding}: ReturnType<typeof ${names.pluginFactoryName}>
  export default ${names.pluginBinding}
}

declare module '${names.virtualId}' {
  import type { ${names.clientTypeName}, ${names.pluginFactoryName} } from '${names.packageName}'

  export const schema: typeof import('${names.virtualId}/schema').schema
  export const ${names.clientBinding}: ${names.clientTypeName}
  export const ${names.pluginBinding}: ReturnType<typeof ${names.pluginFactoryName}>
}
`
}
