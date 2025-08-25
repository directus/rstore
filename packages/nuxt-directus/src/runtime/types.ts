import type { QueryFilter } from '@directus/sdk'

/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, StoreSchema } from '@rstore/vue'

declare module '@rstore/vue' {
  export interface FindOptions<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TSchema extends StoreSchema,
  > {
    filter?: QueryFilter<any, any>
  }
}

export {}
