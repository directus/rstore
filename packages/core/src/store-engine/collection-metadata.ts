import type { ResolvedCollection } from '@rstore/shared'
import { usesDefaultCollectionKey } from '../collection.js'

export interface CollectionMetadata {
  /** Whether writes can contain nested relation payloads. */
  hasRelations: boolean
  /** Fields capable of changing a materialized index membership. */
  indexedFields: ReadonlySet<string>
  /** Whether any materialized indexes exist. */
  hasIndexes: boolean
  /** Index keys reachable from one changed item field. */
  indexesByField: ReadonlyMap<string, ReadonlySet<string>>
  /** Whether default `id`/`__id` key extraction permits safe skips. */
  usesDefaultKey: boolean
  /** Whether wrapped items need computed or relation field resolution. */
  hasRichFields: boolean
}

const metadataByCollection = new WeakMap<object, CollectionMetadata>()

/** Return immutable schema facts cached by resolved collection identity. */
export function getCollectionMetadata(collection: ResolvedCollection<any, any, any>): CollectionMetadata {
  let metadata = metadataByCollection.get(collection)
  if (metadata)
    return metadata

  const indexedFields = new Set<string>()
  const indexesByField = new Map<string, Set<string>>()
  for (const [indexKey, fields] of collection.indexes) {
    for (const field of fields) {
      indexedFields.add(field)
      const indexKeys = indexesByField.get(field) ?? new Set<string>()
      indexesByField.set(field, indexKeys)
      indexKeys.add(indexKey)
    }
  }
  metadata = {
    hasRelations: Object.keys(collection.relations).length > 0,
    indexedFields,
    hasIndexes: collection.indexes.size > 0,
    indexesByField,
    usesDefaultKey: usesDefaultCollectionKey(collection),
    hasRichFields: Object.keys(collection.computed).length > 0 || Object.keys(collection.normalizedRelations).length > 0,
  }
  metadataByCollection.set(collection, metadata)
  return metadata
}
