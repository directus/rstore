import type { CustomCollectionMeta } from '@rstore/vue'
import type { Column, Dialect, Table } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { RstoreDrizzleCondition } from '../../utils/types'
// @ts-expect-error virtual file
import { collectionMetas, dialect, tables, useDrizzles } from '$rstore-drizzle-server-utils.js'
import * as drizzle from 'drizzle-orm'
import { createError } from 'h3'

export interface RstoreDrizzleQueryParams {
  where?: string
  limit?: string
  offset?: string
  orderBy?: string | string[]
  with?: string
  columns?: string
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
        return drizzle[condition.operator](table[condition.field as keyof typeof table] as Column, condition.value)
      }
      else {
        return drizzle[condition.operator]<typeof condition.value>(table[condition.field as keyof typeof table] as Column, condition.value)
      }
    }
    else if ('value1' in condition) {
      return drizzle[condition.operator](table[condition.field as keyof typeof table] as Column, condition.value1, condition.value2)
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
