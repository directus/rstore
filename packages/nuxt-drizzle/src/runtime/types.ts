/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelList } from '@rstore/vue'
import type { RstoreDrizzleCondition } from './utils/types'

declare module '@rstore/vue' {
  export interface CustomModelMeta {
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

    limit?: number
    offset?: number
    with?: DrizzleWith
    columns?: DrizzleColumns
    orderBy?: DrizzleOrderBy
  }
}

// @TODO typed columns
type DrizzleColumns = Record<string, boolean>

// @TODO typed `with` relations
type DrizzleWith = Record<string, boolean | {
  with?: DrizzleWith
  columns?: DrizzleColumns
  limit?: number
}>

// @TODO typed order by
type DrizzleOrderBy = Array<`${string}.${'asc' | 'desc'}`>

export {}
