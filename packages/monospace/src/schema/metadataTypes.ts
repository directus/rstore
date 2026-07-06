/**
 * Raw `MonospaceCollection` item read from the Monospace schema metadata.
 */
export interface MonospaceCollectionMetadataItem {
  /**
   * Global collection id.
   */
  id: string

  /**
   * Collection API name, matching the OpenAPI `x-monospace-mappings` keys.
   */
  apiName: string

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Raw `MonospacePrimitiveField` item read from the Monospace schema metadata.
 */
export interface MonospacePrimitiveFieldMetadataItem {
  /**
   * Global primitive field id.
   */
  id: string

  /**
   * Column API name.
   */
  apiName: string

  /**
   * Owning collection id.
   */
  collectionId: string

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Raw `MonospaceSingleRelationField` item read from the schema metadata.
 */
export interface MonospaceRelationFieldMetadataItem {
  /**
   * Global relation field id.
   */
  id: string

  /**
   * Relation field API name.
   */
  apiName: string

  /**
   * Owning collection id.
   */
  collectionId: string

  /**
   * Target collection id.
   */
  oppositeCollectionId: string

  /**
   * Whether the relation resolves to many items.
   */
  isList?: boolean

  /**
   * Whether a to-one relation is nullable.
   */
  isNullable?: boolean

  /**
   * FK constraint id, set only on the forward (FK-owning) side.
   */
  constraintId?: string | null

  /**
   * Id of the paired relation field on the opposite collection.
   */
  oppositeRelationFieldId?: string | null

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Raw `MonospaceSingleConstraintField` item read from the schema metadata.
 */
export interface MonospaceConstraintFieldMetadataItem {
  /**
   * Owning FK constraint id.
   */
  constraintId: string

  /**
   * Constrained (FK) primitive field id on the forward collection.
   */
  constrainedFieldId: string

  /**
   * Referenced primitive field id on the target collection.
   */
  referencedFieldId: string

  /**
   * Column pair order inside composite constraints.
   */
  order?: number

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Raw `MonospaceIndex` item read from the Monospace schema metadata.
 */
export interface MonospaceIndexMetadataItem {
  /**
   * Global index id.
   */
  id: string

  /**
   * Index kind: `primary`, `unique` or `normal`.
   */
  kind: string

  /**
   * Owning collection id.
   */
  collectionId: string

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Raw `MonospaceIndexField` item read from the Monospace schema metadata.
 */
export interface MonospaceIndexFieldMetadataItem {
  /**
   * Owning index id.
   */
  indexId: string

  /**
   * Indexed primitive field id.
   */
  fieldId: string

  /**
   * Field order inside composite indexes.
   */
  order?: number

  /**
   * Unknown extra columns returned by the items API.
   */
  [key: string]: unknown
}

/**
 * Monospace schema metadata snapshot: the raw items of the system schema
 * meta collections, keyed by meta collection API name — exactly the shape
 * returned by `GET /api/{project}/items/{name}` for each collection.
 */
export interface MonospaceSchemaMetadata {
  /**
   * Project collections.
   */
  MonospaceCollection: MonospaceCollectionMetadataItem[]

  /**
   * Primitive (column-backed) fields.
   */
  MonospacePrimitiveField: MonospacePrimitiveFieldMetadataItem[]

  /**
   * Relation fields (forward and backward sides).
   */
  MonospaceSingleRelationField?: MonospaceRelationFieldMetadataItem[]

  /**
   * FK constraint column pairs.
   */
  MonospaceSingleConstraintField?: MonospaceConstraintFieldMetadataItem[]

  /**
   * Collection indexes, including primary key indexes.
   */
  MonospaceIndex?: MonospaceIndexMetadataItem[]

  /**
   * Index-to-field mappings with composite ordering.
   */
  MonospaceIndexField?: MonospaceIndexFieldMetadataItem[]
}
