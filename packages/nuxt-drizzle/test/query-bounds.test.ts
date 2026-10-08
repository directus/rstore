import type { AddressInfo } from 'node:net'
import type { SQLInputValue } from 'node:sqlite'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { createApp, createError, toNodeListener } from 'h3'
import SuperJSON from 'superjson'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Client-supplied queries used to be unbounded: no default/max `limit`
// (full-table dump), uncapped `keys`, unlimited `include` recursion,
// uncapped `_batch` fan-out, and a raw `with` passthrough that skipped
// relation sanitization entirely. These tests pin the bounds.

const state = vi.hoisted(() => ({
  findMany: [] as any[],
  findFirst: [] as any[],
  findFirstResults: [] as any[],
  todos: undefined as any,
}))

vi.mock('$rstore-drizzle-server-utils.js', async () => {
  const { integer, sqliteTable, text } = await import('drizzle-orm/sqlite-core')
  const todos = sqliteTable('todos', {
    id: integer('id').primaryKey(),
    title: text('title'),
  })
  state.todos = todos
  const secrets = sqliteTable('secrets', {
    id: integer('id').primaryKey(),
    token: text('token'),
  })
  return {
    dialect: 'sqlite',
    tables: { todos, secrets },
    collectionMetas: {
      todos: { table: 'todos', primaryKeys: ['id'] },
      secrets: { table: 'secrets', primaryKeys: ['id'] },
    },
    collectionRelations: {
      // Circular relation graph so include depth can grow indefinitely.
      todos: { secrets: { to: { secrets: { on: { todoId: 'id' } } } } },
      secrets: { todo: { to: { todos: { on: { id: 'todoId' } } } } },
    },
    queryLimits: {
      maxLimit: 10,
      maxKeys: 3,
      maxIncludeDepth: 2,
      maxBatchSize: 2,
    },
    useDrizzles: {
      default: () => ({
        query: {
          todos: {
            findMany: async (q: any) => {
              state.findMany.push(q)
              return []
            },
            findFirst: async (q: any) => {
              state.findFirst.push(q)
              return state.findFirstResults.shift() ?? null
            },
          },
        },
      }),
    },
  }
})

const { drizzleFindMany, drizzleFindOne } = await import('../src/runtime/server/utils/operations')
const { rstoreDrizzleHooks } = await import('../src/runtime/server/utils/hooks')

const event = {} as any

/** Runs a findMany with the given searchQuery and returns the captured drizzle query. */
async function runFindMany(searchQuery: any) {
  await drizzleFindMany({ event, collection: 'todos', params: {}, query: {}, searchQuery })
  return state.findMany.at(-1)
}

/** Execute the adapter predicate against independent rows, including excluded keys. */
function matchingTodoIds(condition: Parameters<SQLiteSyncDialect['sqlToQuery']>[0]) {
  const database = new DatabaseSync(':memory:')
  try {
    database.exec(`
      CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE comments (todo_id INTEGER);
      INSERT INTO todos VALUES (0, 'Zero'), (1, 'One'), (2, 'Two'), (3, 'Three'), (4, 'Four');
      INSERT INTO comments VALUES (1), (2), (2), (3), (3), (3);
    `)
    const { sql, params } = new SQLiteSyncDialect().sqlToQuery(condition)
    return database.prepare(`SELECT id FROM todos WHERE ${sql} ORDER BY id`)
      .all(...params as SQLInputValue[])
      .map(row => row.id)
  }
  finally {
    database.close()
  }
}

beforeEach(() => {
  state.findMany.length = 0
  state.findFirst.length = 0
  state.findFirstResults.length = 0
})

afterEach(() => {
  ;(rstoreDrizzleHooks as any)._hooks = {}
})

describe('findMany — limit bounds', () => {
  it('applies maxLimit as the default when the client sends none', async () => {
    const q = await runFindMany({})
    expect(q.limit).toBe(10)
  })

  it('keeps a client limit below the bound', async () => {
    const q = await runFindMany({ limit: 5 })
    expect(q.limit).toBe(5)
  })

  it('preserves an explicit zero limit', async () => {
    expect((await runFindMany({ limit: 0 })).limit).toBe(0)
  })

  it('clamps a client limit above the bound', async () => {
    const q = await runFindMany({ limit: 5000 })
    expect(q.limit).toBe(10)
  })

  it('rejects negative or non-integer limits with 400', async () => {
    await expect(runFindMany({ limit: -1 })).rejects.toMatchObject({ statusCode: 400 })
    await expect(runFindMany({ limit: 1.5 })).rejects.toMatchObject({ statusCode: 400 })
    expect(state.findMany).toEqual([])
  })
})

describe('findMany — keys bound', () => {
  it('accepts up to maxKeys keys', async () => {
    const q = await runFindMany({ keys: [0, 1, 3] })
    expect(matchingTodoIds(q.where)).toEqual([0, 1, 3])
  })

  it('rejects more than maxKeys keys with 400', async () => {
    await expect(runFindMany({ keys: [1, 2, 3, 4] })).rejects.toMatchObject({ statusCode: 400 })
    expect(state.findMany).toEqual([])
  })
})

describe('findMany — server extras', () => {
  it('registers hook extras before converting the client where condition', async () => {
    rstoreDrizzleHooks.hook('index.get.before', ({ transformQuery }) => {
      transformQuery(q => q.extras({
        score: sql<number>`(select count(*) from comments where comments.todo_id = ${state.todos.id})`.as('score'),
      }))
    })

    const q = await runFindMany({
      where: { operator: 'gte', field: 'score', value: 2 },
    })

    expect(q.extras).toHaveProperty('score')
    expect(matchingTodoIds(q.where)).toEqual([2, 3])
  })
})

describe('include — depth bound', () => {
  it('accepts an include tree within maxIncludeDepth', async () => {
    const q = await runFindMany({ include: { secrets: { include: { todo: true } } } })
    expect(q.with).toEqual({ secrets: { with: { todo: true } } })
  })

  it('rejects an include tree deeper than maxIncludeDepth with 400', async () => {
    await expect(runFindMany({
      include: { secrets: { include: { todo: { include: { secrets: true } } } } },
    })).rejects.toMatchObject({ statusCode: 400 })
    expect(state.findMany).toEqual([])
  })
})

describe('wire `with` passthrough is ignored', () => {
  // `with` was never part of the documented wire contract but was forwarded
  // straight to drizzle, skipping relation sanitization and the allow-list.
  it('findMany ignores a client-sent `with`', async () => {
    const q = await runFindMany({ with: { secrets: true } } as any)
    expect(q.with).toBeUndefined()
  })

  it('findOne ignores a client-sent `with`', async () => {
    await drizzleFindOne({
      event,
      collection: 'todos',
      key: '1',
      params: {},
      query: {},
      searchQuery: { with: { secrets: true } } as any,
    })
    expect(state.findFirst.at(-1).with).toBeUndefined()
  })
})

describe('_batch — operation count bound', () => {
  const servers: Array<ReturnType<typeof createServer>> = []

  afterAll(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  })

  /** Boots a throwaway h3 app exposing the real batch handler. */
  async function bootBatchServer() {
    const handler = (await import('../src/runtime/server/api/_batch.post')).default
    const app = createApp()
    app.use('/batch', handler)
    const server = createServer(toNodeListener(app))
    servers.push(server)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address() as AddressInfo
    return async (operations: any) => fetch(`http://127.0.0.1:${port}/batch`, {
      method: 'POST',
      body: SuperJSON.stringify({ operations }),
    })
  }

  it('rejects a batch above maxBatchSize with 400', async () => {
    const send = await bootBatchServer()
    const response = await send([
      { type: 'fetchFirst', collection: 'todos', key: '1', searchQuery: {} },
      { type: 'fetchFirst', collection: 'todos', key: '2', searchQuery: {} },
      { type: 'fetchFirst', collection: 'todos', key: '3', searchQuery: {} },
    ])
    expect(response.status).toBe(400)
    expect(state.findFirst).toEqual([])
  })

  it('rejects a non-array operations payload with 400', async () => {
    const send = await bootBatchServer()
    const response = await send({ nope: true })
    expect(response.status).toBe(400)
    expect(state.findFirst).toEqual([])
  })

  it('returns each bounded batch fetch in request order using its own key', async () => {
    const first = { id: 1, title: 'First todo', createdAt: new Date('2026-01-02T03:04:05Z') }
    const second = { id: 2, title: 'Second todo', createdAt: new Date('2026-02-03T04:05:06Z') }
    state.findFirstResults.push(first, second)
    const send = await bootBatchServer()
    const response = await send([
      { type: 'fetchFirst', collection: 'todos', key: '1', searchQuery: {} },
      { type: 'fetchFirst', collection: 'todos', key: '2', searchQuery: {} },
    ])
    expect(response.status).toBe(200)
    const { results } = SuperJSON.parse<any>(await response.text())
    expect(results).toEqual([
      { ok: true, result: { id: 1, title: 'First todo', createdAt: new Date('2026-01-02T03:04:05Z') } },
      { ok: true, result: { id: 2, title: 'Second todo', createdAt: new Date('2026-02-03T04:05:06Z') } },
    ])
    const dialect = new SQLiteSyncDialect()
    const predicates = state.findFirst.map(q => dialect.sqlToQuery(q.where))
    expect(predicates.map(({ sql, params }) => ({ sql, params }))).toEqual([
      { sql: '"todos"."id" = ?', params: [1] },
      { sql: '"todos"."id" = ?', params: [2] },
    ])
  })

  it('preserves a denied operation status while completing its allowed peer', async () => {
    rstoreDrizzleHooks.hook('item.get.before', ({ key }) => {
      if (key === '1')
        throw createError({ statusCode: 403, statusMessage: 'Todo access denied' })
    })
    state.findFirstResults.push({ id: 2, title: 'Allowed todo' })
    const send = await bootBatchServer()
    const response = await send([
      { type: 'fetchFirst', collection: 'todos', key: '1', searchQuery: {} },
      { type: 'fetchFirst', collection: 'todos', key: '2', searchQuery: {} },
    ])
    expect(response.status).toBe(200)
    expect(SuperJSON.parse(await response.text())).toEqual({ results: [
      { ok: false, error: 'Todo access denied', statusCode: 403, statusMessage: 'Todo access denied' },
      { ok: true, result: { id: 2, title: 'Allowed todo' } },
    ] })
    expect(state.findFirst).toHaveLength(1)
    expect(new SQLiteSyncDialect().sqlToQuery(state.findFirst[0].where).params).toEqual([2])
  })
})
