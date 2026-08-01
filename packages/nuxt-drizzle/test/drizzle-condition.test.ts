import { integer, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, vi } from 'vitest'

// `src/runtime/server/utils/index.ts` pulls its tables from a build-time
// virtual module; only `dialect` is read at import time.
vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'sqlite',
}))

const { getDrizzleCondition, getDrizzleOrderBy } = await import('../src/runtime/server/utils/index')

const sqliteDialect = new SQLiteSyncDialect()

const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  title: text('title'),
})

/** Compiles a drizzle condition/order to `{ sql, params }`. */
function toQuery(condition: any) {
  return sqliteDialect.sqlToQuery(condition)
}

/** Asserts fn throws an h3 error with statusCode 400. */
function expect400(fn: () => any) {
  let error: any
  try {
    fn()
  }
  catch (e) {
    error = e
  }
  expect(error, 'expected a thrown error').toBeTruthy()
  expect(error.statusCode).toBe(400)
}

// Before the fix, an unknown `field` fell back to a raw
// `sql`${field}`.as(field)` alias. Drizzle renders `SQL.Aliased` with
// `escapeName()` only (no quote doubling), so a crafted field name landed
// unescaped in the WHERE clause and could break out of hook-added tenant
// scoping. Unknown fields must now be rejected with a 400.
describe('getDrizzleCondition — field validation', () => {
  it('builds a parameterized condition for a real column', () => {
    const { sql, params } = toQuery(getDrizzleCondition(todos, { operator: 'eq', field: 'id', value: 1 }))
    expect(sql).toContain('"id" = ?')
    expect(params).toEqual([1])
  })

  it('rejects a field that is not a column of the table', () => {
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 'nope', value: 1 }))
  })

  it('rejects an SQL-injection field name', () => {
    const injection = 'id" = "id") or (1=1) or ("id'
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: injection, value: 'x' }))
    expect400(() => getDrizzleCondition(todos, { operator: 'isNull', field: injection }))
    expect400(() => getDrizzleCondition(todos, { operator: 'between', field: injection, value1: 1, value2: 2 }))
  })

  it('rejects fields inherited from Object.prototype', () => {
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 'constructor', value: 1 }))
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: '__proto__', value: 1 }))
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 'toString', value: 1 }))
  })

  it('rejects non-string fields', () => {
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 42 as any, value: 1 }))
  })

  it('validates fields nested inside and/or/not groups', () => {
    expect400(() => getDrizzleCondition(todos, {
      operator: 'and',
      conditions: [
        { operator: 'eq', field: 'id', value: 1 },
        { operator: 'eq', field: 'id") or (1=1) or ("id', value: 1 },
      ],
    }))
    expect400(() => getDrizzleCondition(todos, {
      operator: 'not',
      condition: { operator: 'eq', field: 'bogus', value: 1 },
    }))
  })
})

// `condition.operator` used to index straight into the drizzle-orm namespace
// (`drizzle[condition.operator]`), letting a client call arbitrary exports
// such as `sql`. Operators must come from the documented allow-list.
describe('getDrizzleCondition — operator validation', () => {
  it('rejects operators that are not in the condition grammar', () => {
    expect400(() => getDrizzleCondition(todos, { operator: 'sql' as any, field: 'id', value: 1 }))
    expect400(() => getDrizzleCondition(todos, { operator: 'getTableColumns' as any, field: 'id', value: 1 }))
    expect400(() => getDrizzleCondition(todos, { operator: 'eq' as any, condition: { operator: 'eq', field: 'id', value: 1 } } as any))
    expect400(() => getDrizzleCondition(todos, { operator: 'sql' as any, conditions: [] } as any))
  })

  it('still accepts every documented operator shape', () => {
    expect(toQuery(getDrizzleCondition(todos, { operator: 'isNull', field: 'title' })).sql).toContain('"title" is null')
    expect(toQuery(getDrizzleCondition(todos, { operator: 'between', field: 'id', value1: 1, value2: 2 })).params).toEqual([1, 2])
    expect(toQuery(getDrizzleCondition(todos, { operator: 'inArray', field: 'id', value: [1, 2] })).params).toEqual([1, 2])
    expect(toQuery(getDrizzleCondition(todos, {
      operator: 'or',
      conditions: [
        { operator: 'eq', field: 'id', value: 1 },
        { operator: 'like', field: 'title', value: 'a%' },
      ],
    })).params).toEqual([1, 'a%'])
    expect(toQuery(getDrizzleCondition(todos, {
      operator: 'not',
      condition: { operator: 'eq', field: 'id', value: 1 },
    })).sql).toContain('not')
  })
})

// Same fallback hole existed for `orderBy` — the column half of `col.asc`
// went through the raw-sql alias when it wasn't a known column.
describe('getDrizzleOrderBy', () => {
  it('orders by a real column', () => {
    const [order] = getDrizzleOrderBy(todos, 'id.asc')
    expect(toQuery(order).sql).toContain('"id" asc')
  })

  it('accepts an array of orderings and desc direction', () => {
    const orders = getDrizzleOrderBy(todos, ['id.desc', 'title.asc'])
    expect(orders).toHaveLength(2)
    expect(toQuery(orders[0]).sql).toContain('"id" desc')
  })

  it('rejects a column that does not exist on the table', () => {
    expect400(() => getDrizzleOrderBy(todos, 'bogus.asc'))
    expect400(() => getDrizzleOrderBy(todos, 'id" desc, (select 1).asc'))
  })

  it('rejects malformed or unknown directions', () => {
    expect400(() => getDrizzleOrderBy(todos, 'id'))
    expect400(() => getDrizzleOrderBy(todos, 'id.bogus'))
  })
})
