/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelList } from '@rstore/vue'
import type { RstoreDrizzleCondition } from './utils/types'

declare module '@rstore/vue' {
  export interface CustomModelMeta {
    scopeId?: string
    table?: string
    primaryKeys?: string[]
  }

  export interface FindOptions<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TModelList extends ModelList,
  > {
    where?: RstoreDrizzleCondition
  }

  export interface CustomParams<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TModelList extends ModelList,
  > {
    /**
     * @deprecated Use \`findOptions.where\` instead
     */
    where?: RstoreDrizzleCondition
  }
}

export {}
