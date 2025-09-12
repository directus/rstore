/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/vue'
import type { RstoreDrizzleCondition } from './utils/types'

declare module '@rstore/vue' {
  export interface CustomCollectionMeta {
    table?: string
    primaryKeys?: string[]
  }

  export interface FindOptions<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    where?: RstoreDrizzleCondition
  }

  export interface CustomParams<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
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
