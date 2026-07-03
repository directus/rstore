import type { Collection } from '@rstore/shared'
import type { MonospaceGeneratedCollectionMeta } from '../runtime'
import type { MonospaceGeneratedField, MonospaceOpenApiDocument, MonospacePrimaryKeyConfig, OpenApiSchema, OpenApiSchemaObject } from './types'

/**
 * Options used to transform Monospace OpenAPI metadata into rstore collections.
 */
export interface BuildMonospaceCollectionsOptions {
  /**
   * Parsed Monospace OpenAPI document.
   */
  document: MonospaceOpenApiDocument

  /**
   * rstore plugin scope id assigned to generated collections.
   */
  scopeId: string

  /**
   * Explicit primary key overrides keyed by collection name.
   */
  primaryKeys?: MonospacePrimaryKeyConfig
}

/**
 * rstore collection plus generated metadata used by templates.
 */
export interface MonospaceCollectionDefinition extends Collection {
  /**
   * TypeScript interface name generated for the collection item.
   */
  typeName: string

  /**
   * Generated TypeScript fields.
   */
  itemFields: MonospaceGeneratedField[]

  /**
   * JavaScript expression used by generated `getKey`.
   */
  getKeyExpression: string

  /**
   * Generated Monospace collection metadata.
   */
  meta: MonospaceGeneratedCollectionMeta

  /**
   * Generated rstore relations.
   */
  relations: NonNullable<Collection['relations']>
}

const IDENTIFIER_RE = /^[A-Z_$][\w$]*$/i

/**
 * Builds rstore collection definitions from Monospace OpenAPI metadata.
 */
export function buildMonospaceCollections(
  options: BuildMonospaceCollectionsOptions,
): MonospaceCollectionDefinition[] {
  const mappings = options.document['x-monospace-mappings'] ?? {}
  return Object.keys(mappings).map((collectionName) => {
    return createCollectionDefinition(collectionName, options)
  })
}

/**
 * Creates a valid TypeScript interface name from a Monospace collection name.
 */
export function monospaceCollectionTypeName(collectionName: string): string {
  const name = collectionName
    .split(/[^\w$]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')

  return IDENTIFIER_RE.test(name) ? name : `Monospace${name || 'Item'}`
}

/**
 * Converts a Monospace OpenAPI schema to a generated TypeScript type.
 */
export function schemaToTsType(schema: OpenApiSchema | undefined): string {
  if (!schema) {
    return 'any'
  }
  if (isReference(schema)) {
    return 'any'
  }
  const union = schema.anyOf ?? schema.oneOf
  if (union?.length) {
    return union.map(item => schemaToTsType(item)).join(' | ')
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map(type => schemaTypeToTs(type, schema)).join(' | ')
  }
  return schemaTypeToTs(schema.type, schema)
}

/**
 * Creates one rstore collection definition.
 */
function createCollectionDefinition(
  collectionName: string,
  options: BuildMonospaceCollectionsOptions,
): MonospaceCollectionDefinition {
  const schema = getCollectionOutputSchema(options.document, collectionName)
  const primaryKeys = resolvePrimaryKeys(collectionName, schema, options.primaryKeys)
  const itemFields = createGeneratedFields(schema)
  const meta = {
    primaryKeys,
    monospace: {
      collection: collectionName,
    },
  }

  return {
    '~type': 'collection',
    'name': collectionName,
    'scopeId': options.scopeId,
    'meta': meta,
    'relations': {},
    'itemFields': itemFields,
    'typeName': monospaceCollectionTypeName(collectionName),
    'getKeyExpression': createGetKeyExpression(primaryKeys),
  }
}

/**
 * Returns the collection output schema for a Monospace collection.
 */
function getCollectionOutputSchema(
  document: MonospaceOpenApiDocument,
  collectionName: string,
): OpenApiSchemaObject {
  const schema = document.components?.schemas?.[`${collectionName}CollectionOutput`]
  if (!schema) {
    throw new Error(`Missing Monospace output schema for collection: ${collectionName}`)
  }
  return schema
}

/**
 * Resolves collection primary keys from overrides, schema extensions, or `id`.
 */
function resolvePrimaryKeys(
  collectionName: string,
  schema: OpenApiSchemaObject,
  primaryKeys?: MonospacePrimaryKeyConfig,
): string[] {
  const override = primaryKeys?.[collectionName]
  if (override) {
    return Array.isArray(override) ? override : [override]
  }
  const schemaKeys = schema['x-monospace-primary-keys']
  if (schemaKeys) {
    return Array.isArray(schemaKeys) ? schemaKeys : [schemaKeys]
  }
  const propertyKey = Object.entries(schema.properties ?? {}).find(([, property]) => {
    return !isReference(property) && property['x-monospace-primary-key'] === true
  })?.[0]
  return [propertyKey ?? 'id']
}

/**
 * Creates generated item fields from an object schema.
 */
function createGeneratedFields(schema: OpenApiSchemaObject): MonospaceGeneratedField[] {
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    optional: !required.has(name),
    type: schemaToTsType(property),
  }))
}

/**
 * Creates the generated `getKey` expression body.
 */
function createGetKeyExpression(primaryKeys: string[]): string {
  return primaryKeys
    .map(key => itemAccessExpression(key))
    .join(' + \'::\' + ')
}

/**
 * Creates a safe JavaScript item property access expression.
 */
function itemAccessExpression(key: string): string {
  return IDENTIFIER_RE.test(key) ? `item.${key}` : `item[${JSON.stringify(key)}]`
}

/**
 * Returns whether a schema is an OpenAPI reference.
 */
function isReference(schema: OpenApiSchema): schema is { $ref: string } {
  return '$ref' in schema
}

/**
 * Converts a JSON schema primitive type to TypeScript.
 */
function schemaTypeToTs(type: string | undefined, schema: OpenApiSchemaObject): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      return `${schemaToTsType(schema.items)}[]`
    case 'object':
      return 'Record<string, any>'
    default:
      return 'any'
  }
}
