import type { Collection } from '@rstore/shared'

/* eslint-disable unused-imports/no-unused-vars */

/**
 * Default scope id assigned to generated Monospace collections and plugins.
 */
export const DEFAULT_MONOSPACE_SCOPE_ID = 'rstore-monospace'

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
