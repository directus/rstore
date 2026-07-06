import type { Collection } from '@rstore/shared'
import type { MonospaceGeneratedCollectionMeta } from '../runtime'
import type { MonospaceResolvedCollectionMetadata } from './metadata'
import type { MonospaceSchemaMetadata } from './metadataTypes'
import type { MonospaceRelationField } from './relations'
import type { MonospaceGeneratedField, MonospaceOpenApiDocument, MonospacePrimaryKeyConfig, OpenApiSchema, OpenApiSchemaObject } from './types'
import { resolveMonospaceSchemaMetadata } from './metadata'
import { applyMonospaceRelations, detectMonospaceRelationFields, mergeMonospaceRelationFieldMetadata } from './relations'

/**
 * Options used to transform Monospace OpenAPI metadata into rstore collections.
 */
export interface BuildMonospaceCollectionsOptions {
  /**
   * Parsed Monospace OpenAPI document.
   */
  document: MonospaceOpenApiDocument

  /**
   * Monospace schema metadata: the raw items of the system schema meta
   * collections, providing primary indexes and FK constraint columns.
   */
  metadata: MonospaceSchemaMetadata

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
 * Builds rstore collection definitions from the Monospace OpenAPI document
 * and the Monospace schema metadata.
 *
 * The OpenAPI document provides the response shapes (item fields, to-many
 * `{ data }` envelopes, TypeScript typing) while the schema metadata
 * provides the true primary keys (primary indexes) and the real FK columns
 * backing relations. Every exposed collection must be present in the
 * metadata.
 */
export function buildMonospaceCollections(
  options: BuildMonospaceCollectionsOptions,
): MonospaceCollectionDefinition[] {
  const metadata = resolveMonospaceSchemaMetadata(options.metadata)
  const collectionNames = Object.keys(options.document['x-monospace-mappings'] ?? {})
  const relationFields = new Map(collectionNames.map((collectionName) => {
    const detected = detectMonospaceRelationFields(getCollectionOutputSchema(options.document, collectionName), collectionNames, {
      collectionName,
      schemas: options.document.components?.schemas,
    })
    return [
      collectionName,
      mergeMonospaceRelationFieldMetadata(collectionName, detected, getCollectionMetadata(metadata, collectionName)),
    ]
  }))

  const definitions = collectionNames.map((collectionName) => {
    return createCollectionDefinition(collectionName, options, getCollectionMetadata(metadata, collectionName), relationFields.get(collectionName) ?? {})
  })

  applyMonospaceRelations(definitions, relationFields)
  return definitions
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
 * Returns the resolved metadata of an exposed collection.
 */
function getCollectionMetadata(
  metadata: Map<string, MonospaceResolvedCollectionMetadata>,
  collectionName: string,
): MonospaceResolvedCollectionMetadata {
  const collectionMetadata = metadata.get(collectionName)
  if (!collectionMetadata) {
    throw new Error(`Collection "${collectionName}" is missing from the Monospace schema metadata`)
  }
  return collectionMetadata
}

/**
 * Creates one rstore collection definition without relations.
 */
function createCollectionDefinition(
  collectionName: string,
  options: BuildMonospaceCollectionsOptions,
  collectionMetadata: MonospaceResolvedCollectionMetadata,
  relationFields: Record<string, MonospaceRelationField>,
): MonospaceCollectionDefinition {
  const schema = getCollectionOutputSchema(options.document, collectionName)
  const primaryKeys = resolvePrimaryKeys(collectionName, collectionMetadata, options.primaryKeys)
  const itemFields = createGeneratedFields(schema, relationFields)
  const relationsMeta = createRelationsMeta(relationFields)
  const meta: MonospaceGeneratedCollectionMeta = {
    primaryKeys,
    monospace: {
      collection: collectionName,
      ...relationsMeta ? { relations: relationsMeta } : {},
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
 * Creates the generated relation metadata carried by the collection meta.
 *
 * Only relations with resolved connect key columns are included, so the
 * generated meta stays compact.
 */
function createRelationsMeta(
  relationFields: Record<string, MonospaceRelationField>,
): NonNullable<MonospaceGeneratedCollectionMeta['monospace']['relations']> | undefined {
  const entries = Object.entries(relationFields)
    .filter(([, field]) => field.connectKeys?.length)
    .map(([name, field]) => [name, { connectKeys: field.connectKeys }] as const)
  return entries.length ? Object.fromEntries(entries) : undefined
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
 * Resolves collection primary keys from overrides or the primary index.
 *
 * The `primaryKeys` config is an explicit override; without it the ordered
 * primary index columns from the schema metadata are used. A collection
 * without a primary index and without an override fails generation, because
 * rstore could not compute stable item keys for it.
 */
function resolvePrimaryKeys(
  collectionName: string,
  collectionMetadata: MonospaceResolvedCollectionMetadata,
  primaryKeys?: MonospacePrimaryKeyConfig,
): string[] {
  const override = primaryKeys?.[collectionName]
  if (override) {
    return Array.isArray(override) ? override : [override]
  }
  if (collectionMetadata.primaryKeys.length) {
    return collectionMetadata.primaryKeys
  }
  throw new Error(`Collection "${collectionName}" has no primary index in the Monospace schema metadata; set the primaryKeys option to override its keys`)
}

/**
 * Creates generated item fields from an object schema.
 *
 * Relation fields are typed with the generated target interfaces and are
 * always optional because Monospace only returns them when they are
 * explicitly selected. To-many fields are typed as plain arrays because the
 * runtime adapter unwraps the REST `{ data }` envelopes.
 */
function createGeneratedFields(
  schema: OpenApiSchemaObject,
  relationFields: Record<string, MonospaceRelationField>,
): MonospaceGeneratedField[] {
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).map(([name, property]) => {
    const relation = relationFields[name]
    if (relation) {
      return {
        name,
        optional: true,
        type: relationFieldTsType(relation),
      }
    }
    return {
      name,
      optional: !required.has(name),
      type: schemaToTsType(property),
    }
  })
}

/**
 * Converts a detected relation field to a generated TypeScript type.
 */
function relationFieldTsType(relation: MonospaceRelationField): string {
  const typeName = monospaceCollectionTypeName(relation.collection)
  if (relation.kind === 'many') {
    return `${typeName}[]`
  }
  return relation.nullable ? `${typeName} | null` : typeName
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
