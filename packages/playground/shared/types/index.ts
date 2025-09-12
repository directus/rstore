/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomCollectionMeta {
    path?: string
    websocketTopic?: string
  }

  export interface CustomFilterOption<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    email?: string
  }

  export interface CustomParams<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    /** Sent to the server */
    filter?: string
  }

  export interface CustomHookMeta {
    storeHistoryItem?: Pick<StoreHistoryItem, 'started'>
  }
}

export {}
