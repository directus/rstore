import type { ResolvedCollection } from '@rstore/shared'

interface CollectionMetadata {
  /** Whether writes can contain nested relation payloads. */
  hasRelations: boolean
  /** Fields capable of changing a materialized index membership. */
  indexedFields: ReadonlySet<string>
}

const metadataByCollection = new WeakMap<object, CollectionMetadata>()

/** Return immutable schema facts cached by resolved collection identity. */
export function getCollectionMetadata(collection: ResolvedCollection<any, any, any>): CollectionMetadata {
  let metadata = metadataByCollection.get(collection)
  if (metadata)
    return metadata

  const indexedFields = new Set<string>()
  for (const fields of collection.indexes.values()) {
    for (const field of fields) indexedFields.add(field)
  }
  metadata = {
    hasRelations: Object.keys(collection.relations).length > 0,
    indexedFields,
  }
  metadataByCollection.set(collection, metadata)
  return metadata
}
