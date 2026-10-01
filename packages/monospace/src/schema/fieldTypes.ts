import type { MonospaceRelationField } from './relations'
import type { MonospaceGeneratedField, OpenApiSchema, OpenApiSchemaObject } from './types'
import { collectionTypeName } from '@rstore/connector-toolkit'

/**
 * Component schemas of the OpenAPI document, used to resolve references.
 */
export type OpenApiComponentSchemas = Record<string, OpenApiSchemaObject>

const SCHEMA_REF_PREFIX = '#/components/schemas/'

/**
 * JSON schema formats of 64-bit integers. Monospace serializes them as
 * decimal strings in responses, since they may exceed the JS safe integer
 * range.
 */
const INT64_FORMATS = new Set(['int64', 'uint64'])

/**
 * Creates a valid TypeScript interface name from a Monospace collection name.
 */
export function monospaceCollectionTypeName(collectionName: string): string {
  return collectionTypeName(collectionName, 'Monospace')
}

/**
 * Converts a Monospace OpenAPI schema to a generated TypeScript type.
 *
 * References to primitive component schemas (for example the `Int64`
 * decimal string schema) are resolved when `schemas` is provided; other
 * references are typed `any`.
 */
export function schemaToTsType(schema: OpenApiSchema | undefined, schemas?: OpenApiComponentSchemas): string {
  const resolved = resolvePrimitiveSchema(schema, schemas)
  if (!resolved) {
    return 'any'
  }
  const union = resolved.anyOf ?? resolved.oneOf
  if (union?.length) {
    return union.map(item => schemaToTsType(item, schemas)).join(' | ')
  }
  if (Array.isArray(resolved.type)) {
    return resolved.type.map(type => schemaTypeToTs(type, resolved, schemas)).join(' | ')
  }
  return schemaTypeToTs(resolved.type, resolved, schemas)
}

/**
 * Returns whether an output property holds a 64-bit integer, directly or
 * as a member of a nullable union.
 */
export function isInt64Schema(schema: OpenApiSchema | undefined, schemas?: OpenApiComponentSchemas): boolean {
  const resolved = resolvePrimitiveSchema(schema, schemas)
  if (!resolved) {
    return false
  }
  const union = resolved.anyOf ?? resolved.oneOf
  if (union?.length) {
    return union.some(item => isInt64Schema(item, schemas))
  }
  return typeof resolved.format === 'string' && INT64_FORMATS.has(resolved.format)
}

/**
 * Creates generated item fields from an object schema.
 *
 * Relation fields are typed with the generated target interfaces and are
 * always optional because Monospace only returns them when they are
 * explicitly selected. To-many fields are typed as plain arrays because the
 * runtime adapter unwraps the REST `{ data }` envelopes.
 */
export function createGeneratedFields(
  schema: OpenApiSchemaObject,
  relationFields: Record<string, MonospaceRelationField>,
  schemas?: OpenApiComponentSchemas,
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
      type: schemaToTsType(property, schemas),
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
 * Resolves a schema to an inline schema object, following references to
 * primitive (non-object) component schemas only. Returns `undefined` for
 * missing schemas and unresolved references.
 */
function resolvePrimitiveSchema(
  schema: OpenApiSchema | undefined,
  schemas: OpenApiComponentSchemas | undefined,
): OpenApiSchemaObject | undefined {
  const ref = schema?.$ref
  if (typeof ref !== 'string') {
    return schema as OpenApiSchemaObject | undefined
  }
  const target = ref.startsWith(SCHEMA_REF_PREFIX)
    ? schemas?.[ref.slice(SCHEMA_REF_PREFIX.length)]
    : undefined
  // Object components (collection outputs, JSON objects) stay untyped, and
  // referenced primitives are never references themselves, so no recursion
  // guard is needed.
  if (!target || target.type === 'object' || target.properties || '$ref' in target) {
    return undefined
  }
  return target
}

/**
 * Converts a JSON schema primitive type to TypeScript.
 */
function schemaTypeToTs(type: string | undefined, schema: OpenApiSchemaObject, schemas?: OpenApiComponentSchemas): string {
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
      return `${schemaToTsType(schema.items, schemas)}[]`
    case 'object':
      return 'Record<string, any>'
    default:
      return 'any'
  }
}
