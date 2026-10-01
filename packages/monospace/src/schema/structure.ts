import type {
  MonospaceCollectionMetadataItem,
  MonospaceConstraintFieldMetadataItem,
  MonospaceIndexFieldMetadataItem,
  MonospaceIndexMetadataItem,
  MonospacePrimitiveFieldMetadataItem,
  MonospaceRelationFieldMetadataItem,
  MonospaceSchemaMetadata,
} from './metadataTypes'
import type { LoadRemoteMonospaceSchemaOptions } from './remote'
import { assertMonospaceSchemaMetadata } from './metadata'
import { fetchRemoteSchemaJson, remoteWorkspaceUrl } from './remote'

/**
 * Nested include selection of the schema structure query.
 */
interface StructureInclude {
  /**
   * Explicit fields selected on the included items. Fields are required on
   * the structure endpoint, and wildcards must never be used: they would
   * select the encrypted data source credentials.
   */
  fields: string[]

  /**
   * Whether the include is a to-many relation, which is paged to 100 items
   * per parent by default and needs `limit=-1`.
   */
  many?: boolean

  /**
   * Nested includes keyed by relation field.
   */
  include?: Record<string, StructureInclude>
}

/**
 * Data sources with their collections, primitive fields, relation fields
 * (with their FK constraint column pairs) and indexes (with their ordered
 * fields): everything the schema metadata snapshot needs, in one request.
 */
const STRUCTURE_QUERY: StructureInclude = {
  fields: ['id'],
  many: true,
  include: {
    collections: {
      fields: ['id', 'apiName'],
      many: true,
      include: {
        primitiveFields: {
          fields: ['id', 'apiName', 'collectionId'],
          many: true,
        },
        relationFields: {
          fields: ['id', 'apiName', 'collectionId', 'oppositeCollectionId', 'isList', 'isNullable', 'constraintId', 'oppositeRelationFieldId'],
          many: true,
          include: {
            constraint: {
              fields: ['id'],
              include: {
                fieldMappings: {
                  fields: ['constraintId', 'constrainedFieldId', 'referencedFieldId', 'order'],
                  many: true,
                },
              },
            },
          },
        },
        indexes: {
          fields: ['id', 'kind', 'collectionId'],
          many: true,
          include: {
            fields: {
              fields: ['indexId', 'fieldId', 'order'],
              many: true,
            },
          },
        },
      },
    },
  },
}

/**
 * Fetches the Monospace schema metadata snapshot from the schema structure
 * endpoint (`GET /api/{workspace}/schema/structure/sources`).
 *
 * The nested structure response is flattened into the raw meta collection
 * item arrays of {@link MonospaceSchemaMetadata}, so the result can be
 * written to disk as-is and used as an offline `metadataInput` snapshot:
 *
 * ```ts
 * const metadata = await loadRemoteSchemaMetadata({ url, workspace, schemaApiKey })
 * await writeFile('schema-metadata.json', JSON.stringify(metadata, null, 2))
 * ```
 *
 * The schema API key needs the `dataModel:read` entitlement.
 */
export async function loadRemoteSchemaMetadata(
  options: LoadRemoteMonospaceSchemaOptions,
): Promise<MonospaceSchemaMetadata> {
  const baseUrl = remoteWorkspaceUrl(options, 'schema metadata')
  const search = new URLSearchParams(serializeStructureQuery(STRUCTURE_QUERY))
  const url = `${baseUrl}/schema/structure/sources?${search}`
  const body = await fetchRemoteSchemaJson(
    options,
    url,
    'schema metadata',
    '. The schema API key needs the dataModel:read entitlement.',
  )
  const metadata = flattenStructure(body)
  assertMonospaceSchemaMetadata(metadata, `${baseUrl}/schema/structure/sources`)
  return metadata
}

/**
 * Serializes a structure query into bracketed query parameter entries, for
 * example `include[collections][fields]=id,apiName` and
 * `include[collections][limit]=-1`.
 */
function serializeStructureQuery(query: StructureInclude, prefix = ''): Array<[string, string]> {
  const key = (name: string) => prefix ? `${prefix}[${name}]` : name
  const entries: Array<[string, string]> = [[key('fields'), query.fields.join(',')]]
  if (query.many) {
    entries.push([key('limit'), '-1'])
  }
  for (const [name, include] of Object.entries(query.include ?? {})) {
    entries.push(...serializeStructureQuery(include, `${key('include')}[${name}]`))
  }
  return entries
}

/**
 * Structure response collection with its included relations.
 */
interface StructureCollection extends MonospaceCollectionMetadataItem {
  /**
   * Included primitive fields.
   */
  primitiveFields?: unknown

  /**
   * Included relation fields, each with its optional FK constraint.
   */
  relationFields?: unknown

  /**
   * Included indexes, each with its ordered fields.
   */
  indexes?: unknown
}

/**
 * Flattens the nested structure response into a metadata snapshot.
 *
 * Collections from every data source are merged; included relations are
 * removed from each item so the snapshot only keeps the selected columns.
 */
function flattenStructure(body: unknown): MonospaceSchemaMetadata {
  const metadata: Required<MonospaceSchemaMetadata> = {
    MonospaceCollection: [],
    MonospacePrimitiveField: [],
    MonospaceSingleRelationField: [],
    MonospaceSingleConstraintField: [],
    MonospaceIndex: [],
    MonospaceIndexField: [],
  }

  for (const source of unwrapList<{ collections?: unknown }>(body, 'data sources')) {
    for (const { primitiveFields, relationFields, indexes, ...collection } of unwrapList<StructureCollection>(source.collections, 'collections')) {
      metadata.MonospaceCollection.push(collection)
      metadata.MonospacePrimitiveField.push(...unwrapList<MonospacePrimitiveFieldMetadataItem>(primitiveFields, 'primitive fields'))

      for (const { constraint, ...field } of unwrapList<MonospaceRelationFieldMetadataItem & { constraint?: { fieldMappings?: unknown } | null }>(relationFields, 'relation fields')) {
        metadata.MonospaceSingleRelationField.push(field)
        if (constraint) {
          metadata.MonospaceSingleConstraintField.push(...unwrapList<MonospaceConstraintFieldMetadataItem>(constraint.fieldMappings, 'constraint fields'))
        }
      }

      for (const { fields, ...index } of unwrapList<MonospaceIndexMetadataItem & { fields?: unknown }>(indexes, 'indexes')) {
        metadata.MonospaceIndex.push(index)
        metadata.MonospaceIndexField.push(...unwrapList<MonospaceIndexFieldMetadataItem>(fields, 'index fields'))
      }
    }
  }

  return metadata
}

/**
 * Unwraps the `{ data }` envelope of a list response or to-many include.
 * A missing include resolves to an empty list.
 */
function unwrapList<TItem>(value: unknown, what: string): TItem[] {
  if (value == null) {
    return []
  }
  const data = typeof value === 'object' && 'data' in value
    ? (value as { data: unknown }).data
    : value
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected a list of ${what} in the Monospace schema structure response`)
  }
  return data as TItem[]
}
