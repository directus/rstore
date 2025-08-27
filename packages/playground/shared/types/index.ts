/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomModelMeta {
    path?: string
    websocketTopic?: string
  }

  export interface CustomFilterOption<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TSchema extends StoreSchema,
  > {
    email?: string
  }

  export interface CustomParams<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
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
