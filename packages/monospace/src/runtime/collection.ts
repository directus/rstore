import type { Collection } from '@rstore/shared'

/* eslint-disable unused-imports/no-unused-vars */

/**
 * Default scope id assigned to generated Monospace collections and plugins.
 */
export const DEFAULT_MONOSPACE_SCOPE_ID = 'rstore-monospace'

/**
 * Monospace item API operation a collection can serve.
 */
export type MonospaceCollectionOperation
  = | 'readMany'
    | 'readOne'
    | 'create'
    | 'updateMany'
    | 'updateOne'
    | 'deleteMany'
    | 'deleteOne'

/**
 * Generated Monospace metadata for one relation field.
 */
export interface MonospaceGeneratedRelationMeta {
  /**
   * Connect key columns accepted by Monospace `_connect` operations for the
   * relation, extracted from the OpenAPI connect key input schemas.
   */
  connectKeys?: string[]

  /**
   * Direction of a to-one relation: `true` when the FK columns are owned by
   * this collection (forward side), `false` when they are owned by the
   * target collection (backward side). Generated from the schema metadata
   * for to-one relations only; when omitted, the write path infers the
   * direction from the relation `on` mapping.
   */
  forward?: boolean
}

/**
 * Monospace metadata stored on generated rstore collections.
 */
export interface MonospaceGeneratedCollectionMeta {
  /**
   * Primary key field names used by REST item endpoints.
   */
  primaryKeys: string[]

  /**
   * Monospace-specific collection metadata.
   */
  monospace: {
    /**
     * Original Monospace collection name.
     */
    collection: string

    /**
     * Generated relation metadata keyed by relation field.
     */
    relations?: Record<string, MonospaceGeneratedRelationMeta>

    /**
     * Whether the collection exposes `/{key}` item routes. `false` when the
     * collection has no single-field primary key route (extension-connector
     * collections): item reads and writes then use filtered collection
     * requests.
     */
    itemRoutes?: boolean

    /**
     * Item API operations the collection serves, read from the OpenAPI
     * path methods. Extension connector collections only serve their
     * declared operations. Omitted when every operation is served.
     */
    operations?: MonospaceCollectionOperation[]

    /**
     * Fields holding 64-bit integers (`int64` / `uint64`), which Monospace
     * returns as decimal strings.
     */
    int64Fields?: string[]
  }
}

/**
 * Minimal collection shape required by Monospace runtime helpers.
 */
export interface MonospaceCollectionLike {
  /**
   * rstore collection name.
   */
  name: string

  /**
   * Monospace metadata generated on the collection.
   */
  meta?: {
    /**
     * Primary key fields generated for REST item endpoints.
     */
    primaryKeys?: string[]

    /**
     * Monospace-specific generated collection metadata.
     */
    monospace?: {
      /**
       * Original Monospace collection name.
       */
      collection?: string

      /**
       * Generated relation metadata keyed by relation field.
       */
      relations?: Record<string, MonospaceGeneratedRelationMeta>

      /**
       * Whether the collection exposes `/{key}` item routes. `false` when the
       * collection has no single-field primary key route (extension-connector
       * collections): item reads and writes then use filtered collection
       * requests.
       */
      itemRoutes?: boolean

      /**
       * Item API operations the collection serves, read from the OpenAPI
       * path methods. Extension connector collections only serve their
       * declared operations. Omitted when every operation is served.
       */
      operations?: MonospaceCollectionOperation[]

      /**
       * Fields holding 64-bit integers (`int64` / `uint64`), which Monospace
       * returns as decimal strings.
       */
      int64Fields?: string[]
    }
  }
}

declare module '@rstore/shared' {
  export interface CustomCollectionMeta<TCollection extends Collection = Collection> {
    /**
     * Primary key fields generated for REST item endpoints.
     */
    primaryKeys?: string[]

    /**
     * Monospace-specific generated collection metadata.
     */
    monospace?: {
      /**
       * Original Monospace collection name.
       */
      collection?: string

      /**
       * Generated relation metadata keyed by relation field.
       */
      relations?: Record<string, MonospaceGeneratedRelationMeta>

      /**
       * Whether the collection exposes `/{key}` item routes. `false` when the
       * collection has no single-field primary key route (extension-connector
       * collections): item reads and writes then use filtered collection
       * requests.
       */
      itemRoutes?: boolean

      /**
       * Item API operations the collection serves, read from the OpenAPI
       * path methods. Extension connector collections only serve their
       * declared operations. Omitted when every operation is served.
       */
      operations?: MonospaceCollectionOperation[]

      /**
       * Fields holding 64-bit integers (`int64` / `uint64`), which Monospace
       * returns as decimal strings.
       */
      int64Fields?: string[]
    }
  }
}

/**
 * Returns generated Monospace primary keys or the default `id` key.
 */
export function getMonospacePrimaryKeys(collection: MonospaceCollectionLike): string[] {
  return collection.meta?.primaryKeys?.length ? collection.meta.primaryKeys : ['id']
}

/**
 * Returns the original Monospace collection name for a generated collection.
 */
export function getMonospaceCollectionName(collection: MonospaceCollectionLike): string {
  return collection.meta?.monospace?.collection ?? collection.name
}

/**
 * Returns the generated direction of a to-one relation (`true` for forward,
 * `false` for backward), or `undefined` when the meta does not declare it.
 */
export function getMonospaceRelationForward(
  collection: MonospaceCollectionLike,
  relationKey: string,
): boolean | undefined {
  return collection.meta?.monospace?.relations?.[relationKey]?.forward
}

/**
 * Returns the generated connect key columns of a relation, if any.
 */
export function getMonospaceRelationConnectKeys(
  collection: MonospaceCollectionLike,
  relationKey: string,
): string[] | undefined {
  const connectKeys = collection.meta?.monospace?.relations?.[relationKey]?.connectKeys
  return connectKeys?.length ? connectKeys : undefined
}
