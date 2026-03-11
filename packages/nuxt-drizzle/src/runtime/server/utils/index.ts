import type { CustomCollectionMeta } from '@rstore/vue'
import type { Column, Table } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { RstoreDrizzleCondition } from '../../utils/types'
// @ts-expect-error virtual file
import { collectionMetas, collectionRelations, dialect, tables, useDrizzles } from '$rstore-drizzle-server-utils.js'
import * as drizzle from 'drizzle-orm'
import { createError } from 'h3'

export type Dialect = 'postgresql' | 'mysql' | 'singlestore' | 'sqlite' | 'gel' | 'turso'

export interface RstoreDrizzleQueryParams {
  where?: any
  limit?: number
  offset?: number
  orderBy?: string | string[]
  include?: any
  with?: any
  columns?: any
  keys?: Array<string | number>
}

export type RstoreDrizzleQueryParamsOne = Omit<RstoreDrizzleQueryParams, 'limit' | 'offset' | 'orderBy'>

export function getDrizzleTableFromCollection(collectionName: string) {
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

export function getDrizzleOrderBy(table: Table, orderByData: string | string[]) {
  const list = typeof orderByData === 'string' ? [orderByData] : orderByData as Array<`${string}.${'asc' | 'desc'}`>
  return list.map((rawOrderBy) => {
    const parts = rawOrderBy.split('.')
    if (parts.length !== 2) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid orderBy',
      })
    }
    const [columnName, order] = parts
    const operator = order === 'asc' ? drizzle.asc : drizzle.desc
    return operator((table as any)[columnName!] ?? drizzle.sql`${columnName}`.as(columnName!))
  })
}

export function convertIncludeToDrizzleWith(collectionName: string, include: unknown): Record<string, any> | undefined {
  if (!isRecord(include)) {
    return undefined
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
      const nestedWith = convertIncludeToDrizzleWith(targetCollectionName, nestedInclude)
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

export function getDrizzleCondition(table: Table, condition: RstoreDrizzleCondition): any {
  if (condition == null) {
    return undefined
  }
  if ('field' in condition) {
    if ('value' in condition) {
      if (condition.operator !== 'arrayContained' && condition.operator !== 'arrayContains' && condition.operator !== 'arrayOverlaps' && condition.operator !== 'inArray' && condition.operator !== 'notInArray') {
        return drizzle[condition.operator](table[condition.field as keyof typeof table] as Column ?? drizzle.sql`${condition.field}`.as(condition.field), condition.value)
      }
      else {
        return drizzle[condition.operator]<typeof condition.value>(table[condition.field as keyof typeof table] as Column ?? drizzle.sql`${condition.field}`.as(condition.field), condition.value)
      }
    }
    else if ('value1' in condition) {
      return drizzle[condition.operator](table[condition.field as keyof typeof table] as Column ?? drizzle.sql`${condition.field}`.as(condition.field), condition.value1, condition.value2)
    }
    else {
      return drizzle[condition.operator](table[condition.field as keyof typeof table] as Column ?? drizzle.sql`${condition.field}`.as(condition.field))
    }
  }
  else if ('condition' in condition) {
    return drizzle[condition.operator](getDrizzleCondition(table, condition.condition))
  }
  else if ('conditions' in condition) {
    return drizzle[condition.operator](...condition.conditions.map(c => getDrizzleCondition(table, c)))
  }
}

export function getDrizzleDialect(): Dialect {
  return dialect
}

export function getDrizzleKeyWhere(key: string, primaryKeys: string[], table: Table) {
  const keys = key.split('::')
  if (primaryKeys.length > 1) {
    return drizzle.and(...primaryKeys.map((pk, i) => drizzle.eq(table[pk as keyof typeof table] as Column, keys[i])))
  }
  else if (primaryKeys[0]) {
    return drizzle.eq(table[primaryKeys[0] as keyof typeof table] as Column, keys[0])
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'No key in route parameters',
    })
  }
}

// for the type, I picked PgDatabase but it can be any
// afaik drizzle-orm doesn't have a generic type for the database
export function rstoreUseDrizzle(): PgDatabase<any> {
  return useDrizzles.default()
}
