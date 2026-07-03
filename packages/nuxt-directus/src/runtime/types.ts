import type { DirectusQueryOptions } from '@rstore/directus'

/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/vue'

/**
 * Directus query options exposed through rstore find options.
 */
export interface RstoreDirectusQueryOptions extends DirectusQueryOptions {}

/**
 * Directus metadata stored on generated rstore collections.
 */
export interface RstoreDirectusCollectionMeta {
  /**
   * Original Directus collection name.
   */
  collection?: string

  /**
   * Whether the collection is a Directus singleton.
   */
  singleton?: boolean
}

declare module '@rstore/vue' {
  export interface CustomCollectionMeta {
    /**
     * Primary keys generated from Directus field metadata.
     */
    primaryKeys?: string[]

    /**
     * Directus-specific metadata for generated collections.
     */
    directus?: RstoreDirectusCollectionMeta
  }

  export interface FindOptions<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > extends RstoreDirectusQueryOptions {}

  export interface CustomParams<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > extends RstoreDirectusQueryOptions {}
}

export {}
