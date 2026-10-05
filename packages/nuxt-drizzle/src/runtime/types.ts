/* eslint-disable unused-imports/no-unused-vars */

import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { RstoreDrizzleCondition } from './utils/types'

/** RStore query extension points are declared by Shared; Vue re-exports them. */
declare module '@rstore/shared' {
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
    columns?: DrizzleColumns
    orderBy?: DrizzleOrderBy

    /**
     * Keys to fetch for the fetchMany operation.
     */
    keys?: Array<string | number>
  }

  export interface CustomIncludeOption<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    where?: RstoreDrizzleCondition
    columns?: DrizzleColumns
    orderBy?: DrizzleOrderBy
    limit?: number
  }
}

// @TODO typed columns
type DrizzleColumns = Record<string, boolean>

// @TODO typed order by
type DrizzleOrderBy = Array<`${string}.${'asc' | 'desc'}`>

export {}
