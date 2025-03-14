import type { CustomModelMeta } from '@rstore/vue'
import type { Column, Dialect, Table } from 'drizzle-orm'
import type { RstoreDrizzleCondition } from '~~/modules/runtime/utils/types'
// @ts-expect-error virtual file
import { dialect, modelMetas, tables } from '$rstore-drizzle-server-utils.js'
import * as drizzle from 'drizzle-orm'

export interface RstoreDrizzleQueryParams {
  where?: string
  limit?: number
}

export function getDrizzleTableFromModel(modelName: string) {
  const { table: tableKey, primaryKeys } = (modelMetas as Record<string, CustomModelMeta>)[modelName]!
  const table = (tables as any)[tableKey!] as Table
  if (!table) {
    throw createError({
      statusCode: 404,
      statusMessage: `Table ${tableKey} not found for model ${modelName}`,
    })
  }
  return {
    table,
    tableKey,
    primaryKeys: primaryKeys ?? ['id'],
  }
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
  const keys = key.split(' + ')
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
