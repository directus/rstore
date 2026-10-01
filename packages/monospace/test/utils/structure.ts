import type { MonospaceSchemaMetadata } from '../../src/schema'

/**
 * Wraps a to-many include result in the `{ data }` envelope returned by
 * Monospace list endpoints.
 */
function envelope<TItem>(data: TItem[]): { data: TItem[] } {
  return { data }
}

/**
 * Converts a flat schema metadata snapshot into the nested response returned
 * by `GET /api/{workspace}/schema/structure/sources` with the collections,
 * fields, relation constraints and indexes included.
 *
 * Collections are split across two data sources (the first collection in a
 * `_system`-like source, the others in a second one) so the loader's
 * flattening across data sources stays covered.
 */
export function createStructureResponseFixture(metadata: MonospaceSchemaMetadata): unknown {
  const constraintFields = metadata.MonospaceSingleConstraintField ?? []
  const indexFields = metadata.MonospaceIndexField ?? []

  const collections = metadata.MonospaceCollection.map(collection => ({
    ...collection,
    primitiveFields: envelope(metadata.MonospacePrimitiveField.filter(field => field.collectionId === collection.id)),
    relationFields: envelope((metadata.MonospaceSingleRelationField ?? [])
      .filter(field => field.collectionId === collection.id)
      .map(field => ({
        ...field,
        // Only forward relation fields own a constraint.
        constraint: field.constraintId == null
          ? null
          : {
              id: field.constraintId,
              fieldMappings: envelope(constraintFields.filter(pair => pair.constraintId === field.constraintId)),
            },
      }))),
    indexes: envelope((metadata.MonospaceIndex ?? [])
      .filter(index => index.collectionId === collection.id)
      .map(index => ({
        ...index,
        fields: envelope(indexFields.filter(indexField => indexField.indexId === index.id)),
      }))),
  }))

  return envelope([
    { id: 'source_system', collections: envelope(collections.slice(0, 1)) },
    { id: 'source_main', collections: envelope(collections.slice(1)) },
  ])
}
