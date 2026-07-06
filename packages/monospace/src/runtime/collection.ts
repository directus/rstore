import type { Collection } from '@rstore/shared'

/* eslint-disable unused-imports/no-unused-vars */

/**
 * Default scope id assigned to generated Monospace collections and plugins.
 */
export const DEFAULT_MONOSPACE_SCOPE_ID = 'rstore-monospace'

/**
 * Generated Monospace metadata for one relation field.
 */
export interface MonospaceGeneratedRelationMeta {
  /**
   * Connect key columns accepted by Monospace `_connect` operations for the
   * relation, extracted from the OpenAPI connect key input schemas.
   */
  connectKeys?: string[]
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
 * Returns the generated connect key columns of a relation, if any.
 */
export function getMonospaceRelationConnectKeys(
  collection: MonospaceCollectionLike,
  relationKey: string,
): string[] | undefined {
  const connectKeys = collection.meta?.monospace?.relations?.[relationKey]?.connectKeys
  return connectKeys?.length ? connectKeys : undefined
}
