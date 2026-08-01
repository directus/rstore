import type { Column, Table } from 'drizzle-orm'
import type { RstoreDrizzleCondition } from '../../utils/types'
import * as drizzle from 'drizzle-orm'
import { createError } from 'h3'

/**
 * Operators accepted on field conditions (`{ operator, field, ... }`).
 * The operator is used to index into the drizzle-orm namespace, so it MUST
 * be validated against this list — otherwise a client could invoke arbitrary
 * drizzle exports (e.g. `sql`).
 */
const FIELD_OPERATORS = new Set([
  'eq',
  'ne',
  'gt',
  'lt',
  'gte',
  'lte',
  'inArray',
  'notInArray',
  'like',
  'notLike',
  'ilike',
  'notIlike',
  'arrayContains',
  'arrayContained',
  'arrayOverlaps',
  'isNull',
  'isNotNull',
  'between',
  'notBetween',
] as const)

/**
 * Resolves a client-supplied field name to a column of the table, or throws
 * a `400`. There is deliberately NO fallback to a raw SQL identifier: drizzle
 * renders `sql`...`.as(alias)` through `escapeName()` without quote doubling,
 * so an unvalidated field name would land unescaped in the WHERE clause
 * (SQL injection defeating hook-added tenant scoping).
 *
 * @param table The drizzle table the condition targets.
 * @param field The client-supplied field name.
 * @returns The matching column.
 */
export function resolveTableColumn(table: Table, field: unknown): Column {
  const columns = drizzle.getTableColumns(table)
  // `hasOwnProperty` guard: `columns[field]` alone would resolve inherited
  // properties such as `constructor` or `toString` to non-column values.
  if (typeof field !== 'string' || !Object.prototype.hasOwnProperty.call(columns, field)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown field in filter: ${String(field)}`,
    })
  }
  return columns[field] as Column
}

/**
 * Converts wire `orderBy` entries (`'column.asc' | 'column.desc'`) into
 * drizzle order expressions. Unknown columns and malformed directions are
 * rejected with a `400` — never interpolated as raw SQL.
 *
 * @param table The drizzle table being ordered.
 * @param orderByData The client-supplied orderBy value(s).
 */
export function getDrizzleOrderBy(table: Table, orderByData: string | string[]) {
  const list = typeof orderByData === 'string' ? [orderByData] : orderByData
  return list.map((rawOrderBy) => {
    const parts = String(rawOrderBy).split('.')
    if (parts.length !== 2 || (parts[1] !== 'asc' && parts[1] !== 'desc')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid orderBy',
      })
    }
    const [columnName, order] = parts
    const operator = order === 'asc' ? drizzle.asc : drizzle.desc
    return operator(resolveTableColumn(table, columnName))
  })
}

/**
 * Converts a wire condition tree into a drizzle condition.
 *
 * Every field is resolved against the table's real columns and every
 * operator is validated against the documented grammar; anything else is
 * rejected with a `400`.
 *
 * @param table The drizzle table the condition targets.
 * @param condition The client-supplied condition tree.
 */
export function getDrizzleCondition(table: Table, condition: RstoreDrizzleCondition): any {
  if (condition == null) {
    return undefined
  }
  if ('field' in condition) {
    if (!FIELD_OPERATORS.has(condition.operator as any)) {
      throw invalidOperator(condition.operator)
    }
    const operator = drizzle[condition.operator] as (...args: any[]) => any
    const column = resolveTableColumn(table, condition.field)
    if ('value' in condition) {
      return operator(column, condition.value)
    }
    else if ('value1' in condition) {
      return operator(column, condition.value1, condition.value2)
    }
    else {
      return operator(column)
    }
  }
  else if ('condition' in condition) {
    if (condition.operator !== 'not') {
      // `as any`: the wire type says 'not' but a hostile client can send anything.
      throw invalidOperator((condition as any).operator)
    }
    return drizzle.not(getDrizzleCondition(table, condition.condition))
  }
  else if ('conditions' in condition) {
    if (condition.operator !== 'and' && condition.operator !== 'or') {
      // `as any`: the wire type says 'and' | 'or' but a hostile client can send anything.
      throw invalidOperator((condition as any).operator)
    }
    return drizzle[condition.operator](...condition.conditions.map(c => getDrizzleCondition(table, c)))
  }
}

/** Builds the `400` thrown for operators outside the condition grammar. */
function invalidOperator(operator: unknown) {
  return createError({
    statusCode: 400,
    statusMessage: `Invalid filter operator: ${String(operator)}`,
  })
}
