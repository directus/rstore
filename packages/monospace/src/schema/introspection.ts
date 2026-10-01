import type { Collection } from '@rstore/shared'
import type { MonospaceGeneratedCollectionMeta } from '../runtime'
import type { MonospaceResolvedCollectionMetadata } from './metadata'
import type { MonospaceSchemaMetadata } from './metadataTypes'
import type { MonospaceRelationField } from './relations'
import type { MonospaceGeneratedField, MonospaceOpenApiDocument, MonospacePrimaryKeyConfig, OpenApiSchemaObject } from './types'
import { createGetKeyExpression } from '@rstore/connector-toolkit'
import { createGeneratedFields, isInt64Schema, monospaceCollectionTypeName } from './fieldTypes'
import { resolveMonospaceSchemaMetadata } from './metadata'
import { detectMonospaceCollectionCapabilities, MONOSPACE_COLLECTION_OPERATION_COUNT } from './operations'
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
  const schemas = options.document.components?.schemas
  const schema = getCollectionOutputSchema(options.document, collectionName)
  const primaryKeys = resolvePrimaryKeys(collectionName, collectionMetadata, options.primaryKeys)
  const itemFields = createGeneratedFields(schema, relationFields, schemas)
  const relationsMeta = createRelationsMeta(relationFields)
  const { itemRoutes, operations } = detectMonospaceCollectionCapabilities(options.document, collectionName)
  const int64Fields = Object.entries(schema.properties ?? {})
    .filter(([name, property]) => !relationFields[name] && isInt64Schema(property, schemas))
    .map(([name]) => name)
  // Optional meta entries are omitted when empty or default (item routes
  // available, every operation served) so the generated meta stays compact.
  const restrictedOperations = operations && operations.length < MONOSPACE_COLLECTION_OPERATION_COUNT
    ? operations
    : undefined
  const meta: MonospaceGeneratedCollectionMeta = {
    primaryKeys,
    monospace: {
      collection: collectionName,
      ...relationsMeta ? { relations: relationsMeta } : {},
      ...itemRoutes ? {} : { itemRoutes: false },
      ...restrictedOperations ? { operations: restrictedOperations } : {},
      ...int64Fields.length ? { int64Fields } : {},
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
    // `resolvePrimaryKeys` guarantees non-empty keys, so the toolkit's
    // `item.id` fallback for empty key lists is never reached here.
    'getKeyExpression': createGetKeyExpression(primaryKeys),
  }
}

/**
 * Creates the generated relation metadata carried by the collection meta.
 *
 * Entries carry the resolved connect key columns and, for to-one relations,
 * the relation direction used by the write path. Relations with neither are
 * omitted, so the generated meta stays compact.
 */
function createRelationsMeta(
  relationFields: Record<string, MonospaceRelationField>,
): NonNullable<MonospaceGeneratedCollectionMeta['monospace']['relations']> | undefined {
  const entries = Object.entries(relationFields)
    .map(([name, field]) => [name, {
      ...field.connectKeys?.length ? { connectKeys: field.connectKeys } : {},
      ...field.kind === 'one' && field.forward != null ? { forward: field.forward } : {},
    }] as const)
    .filter(([, meta]) => Object.keys(meta).length)
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
