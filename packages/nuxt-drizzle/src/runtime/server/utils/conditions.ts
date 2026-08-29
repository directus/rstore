import type { Column, SQL, Table } from 'drizzle-orm'
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
 * Extra SQL expressions selected alongside the table columns (drizzle
 * `extras`), keyed by the alias they are exposed under in the result rows.
 * They are authored server-side by `before` hooks (`transformQuery`), never
 * by the client — same shape drizzle's relational query builder expects.
 */
export type RstoreDrizzleExtras = Record<string, SQL.Aliased>

/**
 * Converts wire `orderBy` entries (`'column.asc' | 'column.desc'`) into
 * drizzle order expressions. Unknown columns and malformed directions are
 * rejected with a `400` — never interpolated as raw SQL.
 *
 * @param table The drizzle table being ordered.
 * @param orderByData The client-supplied orderBy value(s).
 * @param extras Extra SQL expressions attached to the same query, if any.
 * Optional so existing callers that build no extras are unaffected.
 */
export function getDrizzleOrderBy(table: Table, orderByData: string | string[], extras?: RstoreDrizzleExtras) {
  const list = typeof orderByData === 'string' ? [orderByData] : orderByData
  return list.map((rawOrderBy) => {
    const parts = String(rawOrderBy).split('.')
    if (parts.length !== 2 || (parts[1] !== 'asc' && parts[1] !== 'desc')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid orderBy',
      })
    }
    // The cast is what the length/direction check above just proved.
    const [columnName, order] = parts as [string, 'asc' | 'desc']
    const operator = order === 'asc' ? drizzle.asc : drizzle.desc
    // Extras take precedence over a same-named column: the alias is what the
    // client sees in the result rows, so ordering by that name must order by
    // the expression behind it (which is also how SQL itself resolves an
    // output alias in `ORDER BY`).
    // Same `hasOwnProperty` guard as `resolveTableColumn`: `columnName in extras`
    // would resolve inherited names such as `constructor` or `toString` to
    // non-SQL values, which drizzle would bind as an order-by parameter instead
    // of rejecting the unknown field with a `400`.
    if (extras && Object.prototype.hasOwnProperty.call(extras, columnName)) {
      return operator(extras[columnName] as SQL.Aliased)
    }
    return operator(resolveTableColumn(table, columnName))
  })
}

/**
 * Converts a wire condition tree into a drizzle condition.
 *
 * Every field is resolved against a table column or a server-authored extra,
 * and every operator is validated against the documented grammar; anything
 * else is rejected with a `400`.
 *
 * @param table The drizzle table the condition targets.
 * @param condition The client-supplied condition tree.
 * @param extras Server-authored expressions eligible for this list filter.
 */
export function getDrizzleCondition(
  table: Table,
  condition: RstoreDrizzleCondition,
  extras?: RstoreDrizzleExtras,
): any {
  if (condition == null) {
    return undefined
  }
  if ('field' in condition) {
    if (!FIELD_OPERATORS.has(condition.operator as any)) {
      throw invalidOperator(condition.operator)
    }
    const operator = drizzle[condition.operator] as (...args: any[]) => any
    const column = resolveConditionField(table, condition.field, extras)
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
    return drizzle.not(getDrizzleCondition(table, condition.condition, extras))
  }
  else if ('conditions' in condition) {
    if (condition.operator !== 'and' && condition.operator !== 'or') {
      // `as any`: the wire type says 'and' | 'or' but a hostile client can send anything.
      throw invalidOperator((condition as any).operator)
    }
    return drizzle[condition.operator](...condition.conditions.map(c => getDrizzleCondition(table, c, extras)))
  }
}

/**
 * Resolves a filter field to a physical column or a server-authored extra.
 *
 * Real columns intentionally win when an extra shares their name: existing
 * client filters must retain their table-column meaning. Extras are unwrapped
 * to their SQL expression because a SELECT alias cannot be used in WHERE.
 */
function resolveConditionField(table: Table, field: unknown, extras?: RstoreDrizzleExtras): Column | SQL {
  const columns = drizzle.getTableColumns(table)
  if (typeof field === 'string' && Object.prototype.hasOwnProperty.call(columns, field)) {
    return columns[field] as Column
  }
  if (typeof field === 'string' && extras && Object.prototype.hasOwnProperty.call(extras, field)) {
    return extras[field]!.sql
  }
  return resolveTableColumn(table, field)
}

/** Builds the `400` thrown for operators outside the condition grammar. */
function invalidOperator(operator: unknown) {
  return createError({
    statusCode: 400,
    statusMessage: `Invalid filter operator: ${String(operator)}`,
  })
}
