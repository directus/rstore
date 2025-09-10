import type { QueryFilter } from '@directus/sdk'

/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/vue'

declare module '@rstore/vue' {
  export interface FindOptions<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    filter?: QueryFilter<any, any>
  }
}

export {}
