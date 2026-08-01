import { boolean, PgDialect, integer as pgInteger, pgTable } from 'drizzle-orm/pg-core'
import { integer, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, vi } from 'vitest'
import { coerceKeySegment } from '../src/runtime/server/utils/key'

// `src/runtime/server/utils/index.ts` pulls its tables from a build-time
// virtual module; only `dialect` is read at import time.
vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'sqlite',
}))

const { getDrizzleKeyWhere, getDrizzleKeyWhereFromBody } = await import('../src/runtime/server/utils/index')

const sqliteDialect = new SQLiteSyncDialect()
const pgDialect = new PgDialect()

const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  slug: text('slug'),
  done: integer('done', { mode: 'boolean' }),
})

// SQLite stores booleans as 0/1, which would make a coerced `true` and an
// uncoerced `'true'` bind the same-looking value. Postgres keeps booleans as
// booleans, so the assertion there is unambiguous.
const pgTodos = pgTable('todos', {
  id: pgInteger('id').primaryKey(),
  done: boolean('done'),
})

/** Compiles a drizzle condition down to the values that would be bound. */
function params(condition: any, dialect: SQLiteSyncDialect | PgDialect = sqliteDialect) {
  return dialect.sqlToQuery(condition).params
}

describe('coerceKeySegment', () => {
  it('converts segments to the column dataType', () => {
    expect(coerceKeySegment(todos.id, '42')).toBe(42)
    expect(coerceKeySegment(pgTodos.done, 'true')).toBe(true)
    expect(coerceKeySegment(pgTodos.done, 'false')).toBe(false)
    expect(coerceKeySegment(todos.slug, 'abc')).toBe('abc')
  })

  it('leaves a non-numeric segment alone on a numeric column', () => {
    // A malformed key should reach the database as-is rather than as NaN.
    expect(coerceKeySegment(todos.id, 'abc')).toBe('abc')
  })

  it('passes through when there is nothing to coerce', () => {
    expect(coerceKeySegment(undefined, '42')).toBe('42')
    expect(coerceKeySegment(todos.id, undefined)).toBeUndefined()
  })
})

describe('getDrizzleKeyWhere', () => {
  // Route keys are always strings. Drizzle binds parameters using the column's
  // own type, so an uncoerced string never matches an integer primary key —
  // every findOne/update/delete by numeric id silently affects zero rows.
  it('binds a single numeric primary key as a number', () => {
    expect(params(getDrizzleKeyWhere('1', ['id'], todos))).toEqual([1])
  })

  it('binds a single text primary key as a string', () => {
    expect(params(getDrizzleKeyWhere('abc', ['slug'], todos))).toEqual(['abc'])
  })

  it('coerces every segment of a composite key', () => {
    expect(params(getDrizzleKeyWhere('1::abc', ['id', 'slug'], todos))).toEqual([1, 'abc'])
    expect(params(getDrizzleKeyWhere('1::true', ['id', 'done'], pgTodos), pgDialect)).toEqual([1, true])
    expect(params(getDrizzleKeyWhere('1::false', ['id', 'done'], pgTodos), pgDialect)).toEqual([1, false])
  })

  it('leaves a malformed numeric key as a string', () => {
    expect(params(getDrizzleKeyWhere('abc', ['id'], todos))).toEqual(['abc'])
  })

  it('throws when the collection has no primary key', () => {
    expect(() => getDrizzleKeyWhere('1', [], todos)).toThrow(/No key in route parameters/)
  })
})

describe('getDrizzleKeyWhereFromBody', () => {
  // Body values arrive through SuperJSON, so they already have the type the
  // client authored — coercing them like a route segment would be wrong.
  it('binds body values as authored', () => {
    expect(params(getDrizzleKeyWhereFromBody({ id: 42 }, ['id'], todos))).toEqual([42])
    expect(params(getDrizzleKeyWhereFromBody({ slug: 'abc' }, ['slug'], todos))).toEqual(['abc'])
  })

  it('binds every segment of a composite key', () => {
    expect(params(getDrizzleKeyWhereFromBody({ id: 1, slug: 'abc' }, ['id', 'slug'], todos))).toEqual([1, 'abc'])
  })

  // Without this guard a create on an auto-increment table that fails for an
  // unrelated reason (NOT NULL, foreign key) would be probed with a partial
  // key and could be mislabeled as a duplicate.
  it('returns undefined unless the body pins every primary key', () => {
    expect(getDrizzleKeyWhereFromBody({}, ['id'], todos)).toBeUndefined()
    expect(getDrizzleKeyWhereFromBody({ id: null }, ['id'], todos)).toBeUndefined()
    expect(getDrizzleKeyWhereFromBody({ id: 1 }, ['id', 'slug'], todos)).toBeUndefined()
    expect(getDrizzleKeyWhereFromBody({ id: 1 }, [], todos)).toBeUndefined()
  })

  it('returns undefined when a primary key is not a column on the table', () => {
    expect(getDrizzleKeyWhereFromBody({ missing: 1 }, ['missing'], todos)).toBeUndefined()
  })
})
