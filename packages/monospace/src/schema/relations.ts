import type { MonospaceCollectionDefinition } from './introspection'
import type { MonospaceResolvedCollectionMetadata } from './metadata'
import type { OpenApiSchema, OpenApiSchemaObject } from './types'

/**
 * Relation field detected on a Monospace collection output schema.
 */
export interface MonospaceRelationField {
  /**
   * Relation cardinality.
   */
  kind: 'one' | 'many'

  /**
   * Target Monospace collection name.
   */
  collection: string

  /**
   * Whether a to-one relation is nullable.
   */
  nullable: boolean

  /**
   * Connect key columns accepted by Monospace `_connect` operations.
   *
   * Forward relations use the FK constraint referenced columns; backward
   * relations use the columns extracted from the relation's OpenAPI connect
   * keys input schema.
   */
  connectKeys?: string[]

  /**
   * rstore `on` mapping from target column names to source column names,
   * resolved from the FK constraint column pairs in the schema metadata.
   */
  on?: Record<string, string>
}

/**
 * Options accepted by {@link detectMonospaceRelationFields}.
 */
export interface DetectMonospaceRelationFieldsOptions {
  /**
   * Monospace collection name owning the inspected output schema, used to
   * look up the relation connect key input schemas.
   */
  collectionName?: string

  /**
   * All OpenAPI component schemas of the document.
   */
  schemas?: Record<string, OpenApiSchemaObject>
}

const SCHEMA_REF_PREFIX = '#/components/schemas/'
const COLLECTION_OUTPUT_SUFFIX = 'CollectionOutput'
const CONNECT_FORWARD_KEY_INPUT_SUFFIX = 'ConnectForwardKeyInput'
const CONNECT_BACKWARD_KEYS_INPUT_SUFFIX = 'ConnectBackwardKeysInput'

/**
 * Detects relation fields declared on a Monospace collection output schema.
 *
 * To-one relations are `$ref` fields (optionally wrapped in a nullable
 * `oneOf`/`anyOf`) and to-many relations are `{ data: [$ref] }` envelope
 * objects, matching the shapes emitted by Monospace OpenAPI documents.
 * References to schemas that are not exposed collections are ignored.
 *
 * When the document schemas are provided, the connect key columns accepted
 * by `_connect` operations are extracted from the relation's
 * `{collection}{field}ConnectForwardKeyInput` /
 * `{collection}{field}ConnectBackwardKeysInput` component schemas.
 */
export function detectMonospaceRelationFields(
  schema: OpenApiSchemaObject,
  collectionNames: Iterable<string>,
  options: DetectMonospaceRelationFieldsOptions = {},
): Record<string, MonospaceRelationField> {
  const knownCollections = new Set(collectionNames)
  const relations: Record<string, MonospaceRelationField> = {}

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const relation = detectRelationField(property, knownCollections)
    if (relation) {
      const connectKeys = detectConnectKeys(name, options)
      relations[name] = connectKeys ? { ...relation, connectKeys } : relation
    }
  }

  return relations
}

/**
 * Merges resolved schema metadata into OpenAPI-detected relation fields.
 *
 * The metadata provides the real FK column `on` mapping of each relation.
 * Forward relation connect keys always come from the constraint referenced
 * columns: they are the authoritative source, so when the OpenAPI connect
 * input schema disagrees the constraint columns win. Backward relations keep
 * the OpenAPI connect keys (any unique column subset of the target).
 *
 * Every OpenAPI relation field must exist in the metadata — a missing
 * relation means the metadata snapshot is stale or inconsistent.
 */
export function mergeMonospaceRelationFieldMetadata(
  collectionName: string,
  fields: Record<string, MonospaceRelationField>,
  metadata: MonospaceResolvedCollectionMetadata,
): Record<string, MonospaceRelationField> {
  const merged: Record<string, MonospaceRelationField> = {}
  for (const [name, field] of Object.entries(fields)) {
    const relationMetadata = metadata.relations[name]
    if (!relationMetadata) {
      throw new Error(`Relation field "${collectionName}.${name}" is missing from the Monospace schema metadata`)
    }
    if (relationMetadata.targetCollection !== field.collection) {
      throw new Error(`Relation field "${collectionName}.${name}" targets "${field.collection}" in the OpenAPI document but "${relationMetadata.targetCollection}" in the schema metadata`)
    }

    const connectKeys = relationMetadata.forward
      ? relationMetadata.referencedColumns
      : field.connectKeys
    merged[name] = {
      ...field,
      ...connectKeys?.length ? { connectKeys } : {},
      on: relationMetadata.on,
    }
  }
  return merged
}

/**
 * Fills generated rstore relations on Monospace collection definitions.
 *
 * Relations join on the real FK columns resolved from the schema metadata
 * (`on` maps target collection columns to source collection columns):
 *
 * - forward to-one `Todos.author` with constraint `author_id -> Profiles.id`
 *   becomes `on: { id: 'author_id' }`.
 * - backward to-many `Profiles.todos` becomes
 *   `many: true, on: { author_id: 'id' }`.
 */
export function applyMonospaceRelations(
  definitions: MonospaceCollectionDefinition[],
  relationFields: Map<string, Record<string, MonospaceRelationField>>,
): void {
  const definitionsByName = new Map(definitions.map(definition => [definition.name, definition]))

  for (const definition of definitions) {
    const fields = relationFields.get(definition.name) ?? {}
    for (const [relationKey, field] of Object.entries(fields)) {
      if (!definitionsByName.has(field.collection) || !field.on) {
        continue
      }
      definition.relations[relationKey] = {
        ...field.kind === 'many' ? { many: true } : {},
        to: {
          [field.collection]: {
            on: field.on,
          },
        },
      }
    }
  }
}

/**
 * Extracts the connect key columns of a relation field from its Monospace
 * connect key input component schema.
 */
function detectConnectKeys(
  fieldName: string,
  options: DetectMonospaceRelationFieldsOptions,
): string[] | undefined {
  if (!options.collectionName || !options.schemas) {
    return undefined
  }
  // The engine names connect inputs by raw concatenation of the collection
  // API name and the relation field API name.
  const prefix = `${options.collectionName}${fieldName}`
  const input = options.schemas[`${prefix}${CONNECT_FORWARD_KEY_INPUT_SUFFIX}`]
    ?? options.schemas[`${prefix}${CONNECT_BACKWARD_KEYS_INPUT_SUFFIX}`]
  const keys = Object.keys(input?.properties ?? {})
  return keys.length ? keys : undefined
}

/**
 * Detects one relation field from its OpenAPI property schema.
 */
function detectRelationField(
  property: OpenApiSchema,
  knownCollections: Set<string>,
): MonospaceRelationField | undefined {
  if (isReference(property)) {
    const collection = resolveOutputRef(property.$ref, knownCollections)
    return collection ? { collection, kind: 'one', nullable: false } : undefined
  }

  const union = property.oneOf ?? property.anyOf
  if (union?.length) {
    return detectToOneUnion(union, knownCollections)
  }

  return detectToManyEnvelope(property, knownCollections)
}

/**
 * Detects a nullable to-one relation from a `oneOf`/`anyOf` union.
 */
function detectToOneUnion(
  union: OpenApiSchema[],
  knownCollections: Set<string>,
): MonospaceRelationField | undefined {
  const references = union.filter(isReference)
  const nulls = union.filter(item => !isReference(item) && item.type === 'null')
  if (references.length !== 1 || references.length + nulls.length !== union.length) {
    return undefined
  }

  const collection = resolveOutputRef(references[0]!.$ref, knownCollections)
  return collection ? { collection, kind: 'one', nullable: nulls.length > 0 } : undefined
}

/**
 * Detects a to-many relation from a `{ data: [$ref] }` envelope schema.
 */
function detectToManyEnvelope(
  property: OpenApiSchemaObject,
  knownCollections: Set<string>,
): MonospaceRelationField | undefined {
  const data = property.properties?.data
  if (property.type !== 'object' || !data || isReference(data) || data.type !== 'array') {
    return undefined
  }

  const items = data.items
  if (!items || !isReference(items)) {
    return undefined
  }

  const collection = resolveOutputRef(items.$ref, knownCollections)
  return collection ? { collection, kind: 'many', nullable: false } : undefined
}

/**
 * Resolves a schema reference to an exposed Monospace collection name.
 */
function resolveOutputRef(ref: string, knownCollections: Set<string>): string | undefined {
  if (!ref.startsWith(SCHEMA_REF_PREFIX) || !ref.endsWith(COLLECTION_OUTPUT_SUFFIX)) {
    return undefined
  }
  const collection = ref.slice(SCHEMA_REF_PREFIX.length, -COLLECTION_OUTPUT_SUFFIX.length)
  return knownCollections.has(collection) ? collection : undefined
}

/**
 * Returns whether a schema is an OpenAPI reference.
 */
function isReference(schema: OpenApiSchema): schema is { $ref: string } {
  return '$ref' in schema
}
