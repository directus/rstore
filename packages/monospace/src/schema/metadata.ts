import type {
  MonospaceConstraintFieldMetadataItem,
  MonospaceIndexFieldMetadataItem,
  MonospacePrimitiveFieldMetadataItem,
  MonospaceRelationFieldMetadataItem,
  MonospaceSchemaMetadata,
} from './metadataTypes'

/**
 * Resolved relation metadata for one relation field.
 */
export interface MonospaceResolvedRelationMetadata {
  /**
   * Target collection API name.
   */
  targetCollection: string

  /**
   * Whether the relation resolves to many items.
   */
  many: boolean

  /**
   * Whether the relation field owns the FK columns (forward side).
   */
  forward: boolean

  /**
   * rstore `on` mapping from target column API names to source column API
   * names (for example `{ id: 'author_id' }` on a forward to-one relation,
   * `{ author_id: 'id' }` on its backward to-many side).
   */
  on: Record<string, string>

  /**
   * Ordered referenced column API names of the FK constraint, on the target
   * collection for forward relations. These are the connect key columns
   * accepted by forward `_connect` operations.
   */
  referencedColumns: string[]
}

/**
 * Resolved metadata for one Monospace collection.
 */
export interface MonospaceResolvedCollectionMetadata {
  /**
   * Collection API name.
   */
  apiName: string

  /**
   * Ordered primary key column API names from the primary index, or an
   * empty array when the collection has no primary index.
   */
  primaryKeys: string[]

  /**
   * Resolved relations keyed by relation field API name.
   */
  relations: Record<string, MonospaceResolvedRelationMetadata>
}

/**
 * Resolved Monospace schema metadata keyed by collection API name.
 */
export type MonospaceResolvedSchemaMetadata = Map<string, MonospaceResolvedCollectionMetadata>

/**
 * Joins the raw Monospace schema metadata items into per-collection
 * metadata: true primary keys from the primary indexes and real FK column
 * `on` mappings from the constraint column pairs.
 */
export function resolveMonospaceSchemaMetadata(metadata: MonospaceSchemaMetadata): MonospaceResolvedSchemaMetadata {
  const collectionsById = new Map(metadata.MonospaceCollection.map(item => [item.id, item]))
  const fieldsById = new Map(metadata.MonospacePrimitiveField.map(item => [item.id, item]))
  const relationFieldsById = new Map((metadata.MonospaceSingleRelationField ?? []).map(item => [item.id, item]))
  const constraintFields = groupSorted(metadata.MonospaceSingleConstraintField ?? [], item => item.constraintId)
  const indexFields = groupSorted(metadata.MonospaceIndexField ?? [], item => item.indexId)

  const resolved: MonospaceResolvedSchemaMetadata = new Map()
  for (const collection of metadata.MonospaceCollection) {
    resolved.set(collection.apiName, {
      apiName: collection.apiName,
      primaryKeys: resolvePrimaryIndexKeys(metadata, collection.id, indexFields, fieldsById),
      relations: {},
    })
  }

  for (const relationField of metadata.MonospaceSingleRelationField ?? []) {
    const source = collectionsById.get(relationField.collectionId)
    const target = collectionsById.get(relationField.oppositeCollectionId)
    if (!source || !target) {
      throw new Error(`Monospace schema metadata references an unknown collection on relation field "${relationField.apiName}" (${relationField.id})`)
    }

    const pairs = resolveConstraintPairs(relationField, relationFieldsById, constraintFields, fieldsById)
    resolved.get(source.apiName)!.relations[relationField.apiName] = {
      targetCollection: target.apiName,
      many: relationField.isList === true,
      forward: relationField.constraintId != null,
      on: relationField.constraintId != null
        // Forward side: target columns are the referenced columns, source
        // columns are the constrained FK columns owned by this collection.
        ? Object.fromEntries(pairs.map(pair => [pair.referenced, pair.constrained]))
        // Backward side: target columns are the FK columns owned by the
        // opposite collection, source columns are the referenced columns.
        : Object.fromEntries(pairs.map(pair => [pair.constrained, pair.referenced])),
      referencedColumns: pairs.map(pair => pair.referenced),
    }
  }

  return resolved
}

/**
 * Asserts that a value looks like a Monospace schema metadata snapshot.
 */
export function assertMonospaceSchemaMetadata(value: unknown, source: string): asserts value is MonospaceSchemaMetadata {
  if (
    typeof value !== 'object' || value === null
    || !Array.isArray((value as MonospaceSchemaMetadata).MonospaceCollection)
    || !Array.isArray((value as MonospaceSchemaMetadata).MonospacePrimitiveField)
  ) {
    throw new Error(`Expected Monospace schema metadata with MonospaceCollection and MonospacePrimitiveField item arrays from ${source}`)
  }
}

/**
 * Resolves the ordered primary key column names of one collection.
 */
function resolvePrimaryIndexKeys(
  metadata: MonospaceSchemaMetadata,
  collectionId: string,
  indexFields: Map<string, MonospaceIndexFieldMetadataItem[]>,
  fieldsById: Map<string, MonospacePrimitiveFieldMetadataItem>,
): string[] {
  const primaryIndex = (metadata.MonospaceIndex ?? []).find((index) => {
    return index.collectionId === collectionId && index.kind === 'primary'
  })
  if (!primaryIndex) {
    return []
  }

  return (indexFields.get(primaryIndex.id) ?? []).map((indexField) => {
    const field = fieldsById.get(indexField.fieldId)
    if (!field) {
      throw new Error(`Monospace schema metadata references an unknown primitive field "${indexField.fieldId}" on index "${primaryIndex.id}"`)
    }
    return field.apiName
  })
}

/**
 * Resolves the ordered FK column pairs backing a relation field.
 *
 * Backward relation fields resolve their constraint through the paired
 * forward relation field (`oppositeRelationFieldId`).
 */
function resolveConstraintPairs(
  relationField: MonospaceRelationFieldMetadataItem,
  relationFieldsById: Map<string, MonospaceRelationFieldMetadataItem>,
  constraintFields: Map<string, MonospaceConstraintFieldMetadataItem[]>,
  fieldsById: Map<string, MonospacePrimitiveFieldMetadataItem>,
): Array<{ constrained: string, referenced: string }> {
  let constraintId = relationField.constraintId
  if (constraintId == null) {
    const forward = relationField.oppositeRelationFieldId != null
      ? relationFieldsById.get(relationField.oppositeRelationFieldId)
      : undefined
    if (forward?.constraintId == null) {
      throw new Error(`Monospace schema metadata has no FK constraint for relation field "${relationField.apiName}" (${relationField.id})`)
    }
    constraintId = forward.constraintId
  }

  const pairs = constraintFields.get(constraintId) ?? []
  if (!pairs.length) {
    throw new Error(`Monospace schema metadata has no constraint columns for constraint "${constraintId}" of relation field "${relationField.apiName}"`)
  }

  return pairs.map((pair) => {
    const constrained = fieldsById.get(pair.constrainedFieldId)
    const referenced = fieldsById.get(pair.referencedFieldId)
    if (!constrained || !referenced) {
      throw new Error(`Monospace schema metadata references unknown primitive fields on constraint "${constraintId}"`)
    }
    return { constrained: constrained.apiName, referenced: referenced.apiName }
  })
}

/**
 * Groups items by key and sorts each group by its `order` column.
 */
function groupSorted<TItem extends { order?: number }>(
  items: TItem[],
  key: (item: TItem) => string,
): Map<string, TItem[]> {
  const groups = new Map<string, TItem[]>()
  for (const item of items) {
    const group = groups.get(key(item))
    if (group) {
      group.push(item)
    }
    else {
      groups.set(key(item), [item])
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  return groups
}
