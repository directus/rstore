import type { CodegenCollection, RenderedItemField, VirtualModuleNames } from '@rstore/connector-toolkit'
import type { MonospaceCollectionDefinition } from './introspection'
import {
  generateCollectionsTemplate as toolkitGenerateCollectionsTemplate,
  generateItemsTemplate as toolkitGenerateItemsTemplate,
  generateTypedCollectionsTemplate as toolkitGenerateTypedCollectionsTemplate,
  generateViteDeclarations as toolkitGenerateViteDeclarations,
  generateViteIndexTemplate as toolkitGenerateViteIndexTemplate,
  generateViteSchemaTemplate as toolkitGenerateViteSchemaTemplate,
} from '@rstore/connector-toolkit'

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
 * Names used by the generated Monospace Vite virtual modules.
 */
const MONOSPACE_MODULE_NAMES: VirtualModuleNames = {
  virtualId: 'virtual:rstore-monospace',
  clientBinding: 'monospace',
  pluginBinding: 'monospacePlugin',
  packageName: '@rstore/monospace',
  clientTypeName: 'MonospaceRestClient',
  pluginFactoryName: 'createMonospaceRstorePlugin',
}

/**
 * Generated collection narrowed to the toolkit codegen shape.
 *
 * `buildMonospaceCollections` always assigns `scopeId`, which is optional on
 * the base rstore `Collection` type.
 */
type MonospaceCodegenCollection = MonospaceCollectionDefinition & CodegenCollection

/**
 * Narrows generated collections to the toolkit codegen shape.
 */
function toCodegenCollections(collections: MonospaceCollectionDefinition[]): MonospaceCodegenCollection[] {
  return collections as MonospaceCodegenCollection[]
}

/**
 * Returns the rendered item interface fields of a generated collection.
 */
function getItemFields(collection: MonospaceCollectionDefinition): RenderedItemField[] {
  return collection.itemFields
}

/**
 * Generates the runtime collection template consumed by `@rstore/nuxt`.
 */
export function generateCollectionsTemplate(collections: MonospaceCollectionDefinition[]): string {
  return toolkitGenerateCollectionsTemplate(toCodegenCollections(collections))
}

/**
 * Generates TypeScript item interfaces from Monospace OpenAPI metadata.
 */
export function generateItemsTemplate(collections: MonospaceCollectionDefinition[]): string {
  return toolkitGenerateItemsTemplate(toCodegenCollections(collections), getItemFields)
}

/**
 * Generates typed collection declarations for Nuxt's virtual type system.
 */
export function generateTypedCollectionsTemplate(
  collections: MonospaceCollectionDefinition[],
  options: GenerateTypedCollectionsTemplateOptions = {},
): string {
  return toolkitGenerateTypedCollectionsTemplate(toCodegenCollections(collections), {
    itemsImport: options.itemsImport ?? '#build/$rstore-monospace-items',
  })
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
  return toolkitGenerateViteSchemaTemplate(toCodegenCollections(collections))
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
  return toolkitGenerateViteIndexTemplate(MONOSPACE_MODULE_NAMES)
}

/**
 * Generates TypeScript declarations for Vite virtual Monospace modules.
 */
export function generateViteDeclarations(collections: MonospaceCollectionDefinition[]): string {
  return toolkitGenerateViteDeclarations(toCodegenCollections(collections), MONOSPACE_MODULE_NAMES, {
    getFields: getItemFields,
    includeRelationsLine: true,
  })
}
