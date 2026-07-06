import type { MonospaceQueryOptions, MonospaceRestClient } from '@rstore/monospace'

/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/vue'

/**
 * Monospace query options exposed through rstore find options.
 */
export interface RstoreMonospaceQueryOptions extends MonospaceQueryOptions {}

/**
 * Monospace metadata stored on generated rstore collections.
 */
export interface RstoreMonospaceCollectionMeta {
  /**
   * Original Monospace collection name.
   */
  collection?: string

  /**
   * Generated relation metadata keyed by relation field.
   */
  relations?: Record<string, RstoreMonospaceRelationMeta>
}

/**
 * Generated Monospace metadata for one relation field.
 */
export interface RstoreMonospaceRelationMeta {
  /**
   * Connect key columns accepted by Monospace `_connect` operations.
   */
  connectKeys?: string[]
}

declare module '@rstore/vue' {
  export interface CustomCollectionMeta {
    /**
     * Primary keys generated from Monospace OpenAPI metadata.
     */
    primaryKeys?: string[]

    /**
     * Monospace-specific metadata for generated collections.
     */
    monospace?: RstoreMonospaceCollectionMeta
  }

  export interface FindOptions<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > extends RstoreMonospaceQueryOptions {}

  export interface CustomParams<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > extends RstoreMonospaceQueryOptions {}
}

declare module '#app' {
  interface NuxtApp {
    /**
     * Monospace REST client registered by the rstore Monospace plugin.
     */
    $monospace: MonospaceRestClient
  }
}

export {}
