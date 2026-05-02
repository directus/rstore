import type { DirectusCollectionDefinition } from './introspection'
import { directusFieldToTsType } from './introspection'

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
export function generateTypedCollectionsTemplate(collections: DirectusCollectionDefinition[]): string {
  if (!collections.length) {
    return 'export {}\n'
  }

  const imports = collections.map(collection => collection.typeName).join(',\n  ')

  return `import { withItemType } from '@rstore/vue'
import type {
  ${imports}
} from '#build/$rstore-directus-items'

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
export function generateConfigTemplate(options: { url: string, scopeId: string }): string {
  return `export const url = ${JSON.stringify(options.url)}
export const scopeId = ${JSON.stringify(options.scopeId)}
`
}

/**
 * Formats a Directus field as a TypeScript property name.
 */
function tsPropertyName(name: string): string {
  return /^[A-Z_$][\w$]*$/i.test(name) ? name : JSON.stringify(name)
}
