import type { CustomCollectionMeta } from '@rstore/vue'
import type { Column, Table } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
// @ts-expect-error virtual file
import { collectionMetas, collectionRelations, dialect, tables, useDrizzles } from '$rstore-drizzle-server-utils.js'
import * as drizzle from 'drizzle-orm'
import { createError } from 'h3'
import { assertCollectionAllowed } from './allow-list'
import { getDrizzleCondition, getDrizzleOrderBy } from './conditions'
import { coerceKeySegment } from './key'
import { getQueryLimits } from './limits'

export { getDrizzleCondition, getDrizzleOrderBy } from './conditions'

export type Dialect = 'postgresql' | 'mysql' | 'singlestore' | 'sqlite' | 'gel' | 'turso'

export interface RstoreDrizzleQueryParams {
  where?: any
  limit?: number
  offset?: number
  orderBy?: string | string[]
  include?: any
  columns?: any
  keys?: Array<string | number>
}

export type RstoreDrizzleQueryParamsOne = Omit<RstoreDrizzleQueryParams, 'limit' | 'offset' | 'orderBy'>

/**
 * Resolves a collection name to its drizzle table and primary keys.
 *
 * Single choke point for the `allowTables` allow-list: every client-reachable
 * path (REST routes, `_batch` operations, relation `include`s) resolves its
 * table here, so a non-allowed collection is rejected with a `403` no matter
 * how the request came in.
 *
 * @param collectionName The collection name from the request.
 * @param options Internal options.
 * @param options.skipAllowCheck Skip the allow-list check — reserved for
 * server-initiated work (e.g. publishing realtime updates); never pass it
 * for client-supplied collection names.
 */
export function getDrizzleTableFromCollection(collectionName: string, options?: { skipAllowCheck?: boolean }) {
  if (!options?.skipAllowCheck) {
    assertCollectionAllowed(collectionName)
  }
  const table = (tables as any)[collectionName] as Table
  if (!table) {
    throw createError({
      statusCode: 404,
      statusMessage: `Table not found for collection ${collectionName}`,
    })
  }
  const { table: tableKey, primaryKeys } = (collectionMetas as Record<string, CustomCollectionMeta>)[collectionName]!
  return {
    table,
    tableKey,
    primaryKeys: primaryKeys ?? ['id'],
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return value != null && typeof value === 'object'
}

export function getDrizzleCollectionRelations(collectionName: string) {
  return (collectionRelations as Record<string, Record<string, any>>)[collectionName] ?? {}
}

/**
 * Converts a client-supplied `include` tree into a drizzle `with` object.
 *
 * Every included relation resolves its target collection through
 * `getDrizzleTableFromCollection`, so the `allowTables` allow-list applies to
 * related tables too, and recursion is capped at `maxIncludeDepth`.
 *
 * @param collectionName The collection the include tree starts from.
 * @param include The client-supplied include tree.
 * @param depth Current recursion depth (internal).
 */
export function convertIncludeToDrizzleWith(collectionName: string, include: unknown, depth = 0): Record<string, any> | undefined {
  if (!isRecord(include)) {
    return undefined
  }

  const { maxIncludeDepth } = getQueryLimits()
  if (maxIncludeDepth !== false && depth >= maxIncludeDepth) {
    throw createError({
      statusCode: 400,
      statusMessage: `Include tree is too deep (max ${maxIncludeDepth} levels)`,
    })
  }

  const relations = getDrizzleCollectionRelations(collectionName)
  const result: Record<string, any> = {}

  for (const relationKey in include) {
    const relationInclude = include[relationKey]
    if (!relationInclude || !(relationKey in relations)) {
      continue
    }

    const relation = relations[relationKey]
    const targetCollectionName = relation?.to ? Object.keys(relation.to)[0] : undefined

    if (targetCollectionName) {
      // Enforce the allow-list even for `include: { relation: true }`
      // shortcuts that don't need the table itself.
      assertCollectionAllowed(targetCollectionName)
    }

    if (relationInclude === true || !isRecord(relationInclude)) {
      result[relationKey] = true
      continue
    }

    const nestedInclude = 'include' in relationInclude ? relationInclude.include : relationInclude
    const relationWith: Record<string, any> = {}

    if (targetCollectionName) {
      const { table } = getDrizzleTableFromCollection(targetCollectionName)
      if ('where' in relationInclude && relationInclude.where != null) {
        relationWith.where = getDrizzleCondition(table, relationInclude.where)
      }
      if ('orderBy' in relationInclude && relationInclude.orderBy != null) {
        relationWith.orderBy = getDrizzleOrderBy(table, relationInclude.orderBy)
      }
      const nestedWith = convertIncludeToDrizzleWith(targetCollectionName, nestedInclude, depth + 1)
      if (nestedWith && Object.keys(nestedWith).length) {
        relationWith.with = nestedWith
      }
    }

    if ('columns' in relationInclude && relationInclude.columns != null) {
      relationWith.columns = relationInclude.columns
    }
    if ('limit' in relationInclude && relationInclude.limit != null) {
      relationWith.limit = relationInclude.limit
    }

    result[relationKey] = Object.keys(relationWith).length ? relationWith : true
  }

  return Object.keys(result).length ? result : undefined
}

export function getDrizzleCollectionNameFromTable(table: Table) {
  const collectionName = Object.keys(tables).find(name => (tables as any)[name] === table)
  if (!collectionName) {
    throw createError({
      statusCode: 404,
      statusMessage: `Collection not found for table ${table._.name}`,
    })
  }
  return collectionName
}

export function getDrizzleDialect(): Dialect {
  return dialect
}

export function getDrizzleKeyWhere(key: string, primaryKeys: string[], table: Table) {
  const keys = key.split('::')
  if (primaryKeys.length > 1) {
    return drizzle.and(...primaryKeys.map((pk, i) => {
      const column = table[pk as keyof typeof table] as Column
      return drizzle.eq(column, coerceKeySegment(column, keys[i]))
    }))
  }
  else if (primaryKeys[0]) {
    const column = table[primaryKeys[0] as keyof typeof table] as Column
    return drizzle.eq(column, coerceKeySegment(column, keys[0]))
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'No key in route parameters',
    })
  }
}

/**
 * Builds the `where` matching the primary key carried by a request body, or
 * `undefined` when the body doesn't pin every primary key column.
 *
 * Unlike `getDrizzleKeyWhere` these are not route segments: bodies travel
 * through SuperJSON, so each value still has the type the client authored
 * (number, string, `Date`) and must *not* go through `coerceKeySegment`.
 *
 * @param body The request body.
 * @param primaryKeys The collection primary key column names.
 * @param table The drizzle table.
 * @returns A drizzle condition, or `undefined` when the key is incomplete.
 */
export function getDrizzleKeyWhereFromBody(body: Record<string, any>, primaryKeys: string[], table: Table) {
  if (!primaryKeys.length) {
    return undefined
  }
  const conditions: any[] = []
  for (const primaryKey of primaryKeys) {
    const value = body?.[primaryKey]
    const column = table[primaryKey as keyof typeof table] as Column | undefined
    if (value == null || !column) {
      return undefined
    }
    conditions.push(drizzle.eq(column, value))
  }
  return conditions.length > 1 ? drizzle.and(...conditions) : conditions[0]
}

// for the type, I picked PgDatabase but it can be any
// afaik drizzle-orm doesn't have a generic type for the database
export function rstoreUseDrizzle(): PgDatabase<any> {
  return useDrizzles.default()
}
