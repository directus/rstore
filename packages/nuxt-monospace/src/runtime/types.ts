import type { MonospaceGeneratedRelationMeta, MonospaceQueryOptions, MonospaceRestClient } from '@rstore/monospace'

/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, CustomCollectionMeta, StoreSchema } from '@rstore/vue'

/**
 * Monospace query options exposed through rstore find options.
 */
export interface RstoreMonospaceQueryOptions extends MonospaceQueryOptions {}

/**
 * Monospace metadata stored on generated rstore collections. The
 * `CustomCollectionMeta` augmentation itself comes from `@rstore/monospace`.
 */
export type RstoreMonospaceCollectionMeta = NonNullable<CustomCollectionMeta['monospace']>

/**
 * Generated Monospace metadata for one relation field.
 */
export type RstoreMonospaceRelationMeta = MonospaceGeneratedRelationMeta

declare module '@rstore/vue' {
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
