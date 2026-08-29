import { sql } from 'drizzle-orm'
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

describe('getDrizzleCondition — server-authored extras', () => {
  const extras = {
    score: sql<number>`(select count(*) from comments where comments.todo_id = ${todos.id})`.as('score'),
    // Deliberately shadows a real column to pin down filter precedence.
    title: sql<string>`lower(${todos.title})`.as('title'),
  }

  it('filters a nested condition through the underlying extra expression', () => {
    const { sql: query, params } = toQuery(getDrizzleCondition(todos, {
      operator: 'and',
      conditions: [
        { operator: 'eq', field: 'id', value: 1 },
        {
          operator: 'or',
          conditions: [
            { operator: 'gte', field: 'score', value: 2 },
            { operator: 'isNull', field: 'score' },
          ],
        },
      ],
    }, extras))

    expect(query).toContain('select count(*) from comments')
    expect(query).not.toContain('"score"')
    expect(params).toEqual([1, 2])
  })

  it('keeps physical columns ahead of same-named extras', () => {
    const { sql: query, params } = toQuery(getDrizzleCondition(todos, {
      operator: 'eq',
      field: 'title',
      value: 'Original title',
    }, extras))

    expect(query).toContain('"todos"."title" = ?')
    expect(query).not.toContain('lower(')
    expect(params).toEqual(['Original title'])
  })

  it('still rejects unknown and inherited fields when extras exist', () => {
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 'nope', value: 1 }, extras))
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: 'constructor', value: 1 }, extras))
    expect400(() => getDrizzleCondition(todos, { operator: 'eq', field: '__proto__', value: 1 }, extras))
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

// `findMany` attaches the `extras` built by `before` hooks to the query but
// used to withhold them from the ordering, so `orderBy=<extra>.desc` 400ed on
// a column the response actually contains.
//
// The assertions rely on how drizzle renders each kind of chunk: an
// `SQL.Aliased` becomes a bare escaped alias (`"score"`) while a column is
// table-qualified (`"todos"."id"`), so the compiled SQL says which of the two
// resolved.
describe('getDrizzleOrderBy — extras', () => {
  const extras = {
    score: sql<number>`(select count(*) from comments where comments.todo_id = ${todos.id})`.as('score'),
    // Deliberately shadows the `title` column to pin down precedence.
    title: sql<string>`lower(${todos.title})`.as('title'),
  }

  it('orders by an extra in both directions', () => {
    expect(toQuery(getDrizzleOrderBy(todos, 'score.asc', extras)[0]).sql).toBe('"score" asc')
    expect(toQuery(getDrizzleOrderBy(todos, 'score.desc', extras)[0]).sql).toBe('"score" desc')
  })

  it('still orders by a real column when extras are passed', () => {
    expect(toQuery(getDrizzleOrderBy(todos, 'id.asc', extras)[0]).sql).toBe('"todos"."id" asc')
  })

  // An extra selected under a column's name replaces that field in the result
  // rows, so ordering by the name must follow what the client sees.
  it('prefers an extra over a column of the same name', () => {
    expect(toQuery(getDrizzleOrderBy(todos, 'title.asc', extras)[0]).sql).toBe('"title" asc')
  })

  // A plain `columnName in extras` lookup walks the prototype chain, so
  // `orderBy=constructor.asc` resolves to `Object`, which drizzle then binds
  // as an order-by parameter (`order by ? asc`) instead of the request being
  // rejected like any other unknown field.
  it('rejects orderings inherited from Object.prototype', () => {
    expect400(() => getDrizzleOrderBy(todos, 'constructor.asc', extras))
    expect400(() => getDrizzleOrderBy(todos, 'toString.desc', extras))
    expect400(() => getDrizzleOrderBy(todos, '__proto__.asc', extras))
  })

  // The parameter is optional: callers that build no extras (relation
  // ordering) must keep rejecting anything that is not a column.
  it('rejects an extra name when no extras are passed', () => {
    expect400(() => getDrizzleOrderBy(todos, 'score.asc'))
    expect(toQuery(getDrizzleOrderBy(todos, 'title.asc')[0]).sql).toBe('"todos"."title" asc')
  })
})
