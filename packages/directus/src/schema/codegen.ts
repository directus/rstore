import type { CodegenCollection, RenderedItemField, VirtualModuleNames } from '@rstore/connector-toolkit'
import type { DirectusCollectionDefinition } from './introspection'
import {
  generateCollectionsTemplate as toolkitGenerateCollectionsTemplate,
  generateItemsTemplate as toolkitGenerateItemsTemplate,
  generateTypedCollectionsTemplate as toolkitGenerateTypedCollectionsTemplate,
  generateViteDeclarations as toolkitGenerateViteDeclarations,
  generateViteIndexTemplate as toolkitGenerateViteIndexTemplate,
  generateViteSchemaTemplate as toolkitGenerateViteSchemaTemplate,
} from '@rstore/connector-toolkit'
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
 * Names used by the generated Directus Vite virtual modules.
 */
const DIRECTUS_MODULE_NAMES: VirtualModuleNames = {
  virtualId: 'virtual:rstore-directus',
  clientBinding: 'directus',
  pluginBinding: 'directusPlugin',
  packageName: '@rstore/directus',
  clientTypeName: 'DirectusRstoreClient',
  pluginFactoryName: 'createDirectusRstorePlugin',
}

/**
 * Generated collection narrowed to the toolkit codegen shape.
 *
 * `buildDirectusCollections` always assigns `scopeId`, which is optional on
 * the base rstore `Collection` type.
 */
type DirectusCodegenCollection = DirectusCollectionDefinition & CodegenCollection

/**
 * Narrows generated collections to the toolkit codegen shape.
 */
function toCodegenCollections(collections: DirectusCollectionDefinition[]): DirectusCodegenCollection[] {
  return collections as DirectusCodegenCollection[]
}

/**
 * Returns the rendered item interface fields of a generated collection.
 */
function getItemFields(collection: DirectusCollectionDefinition): RenderedItemField[] {
  return collection.directusFields.map(field => ({
    name: field.field,
    type: directusFieldToTsType(field),
  }))
}

/**
 * Generates the runtime collection template consumed by `@rstore/nuxt`.
 */
export function generateCollectionsTemplate(collections: DirectusCollectionDefinition[]): string {
  return toolkitGenerateCollectionsTemplate(toCodegenCollections(collections))
}

/**
 * Generates TypeScript item interfaces from Directus field metadata.
 */
export function generateItemsTemplate(collections: DirectusCollectionDefinition[]): string {
  return toolkitGenerateItemsTemplate(toCodegenCollections(collections), getItemFields)
}

/**
 * Generates typed collection declarations for Nuxt's virtual type system.
 */
export function generateTypedCollectionsTemplate(
  collections: DirectusCollectionDefinition[],
  options: GenerateTypedCollectionsTemplateOptions = {},
): string {
  return toolkitGenerateTypedCollectionsTemplate(toCodegenCollections(collections), {
    itemsImport: options.itemsImport ?? '#build/$rstore-directus-items',
  })
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
  return toolkitGenerateViteSchemaTemplate(toCodegenCollections(collections))
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
  return toolkitGenerateViteIndexTemplate(DIRECTUS_MODULE_NAMES)
}

/**
 * Generates TypeScript declarations for Vite virtual Directus modules.
 */
export function generateViteDeclarations(collections: DirectusCollectionDefinition[]): string {
  return toolkitGenerateViteDeclarations(toCodegenCollections(collections), DIRECTUS_MODULE_NAMES, {
    getFields: getItemFields,
  })
}
