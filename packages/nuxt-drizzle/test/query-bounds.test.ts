import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import SuperJSON from 'superjson'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Client-supplied queries used to be unbounded: no default/max `limit`
// (full-table dump), uncapped `keys`, unlimited `include` recursion,
// uncapped `_batch` fan-out, and a raw `with` passthrough that skipped
// relation sanitization entirely. These tests pin the bounds.

const state = vi.hoisted(() => ({
  findMany: [] as any[],
  findFirst: [] as any[],
}))

vi.mock('$rstore-drizzle-server-utils.js', async () => {
  const { integer, sqliteTable, text } = await import('drizzle-orm/sqlite-core')
  const todos = sqliteTable('todos', {
    id: integer('id').primaryKey(),
    title: text('title'),
  })
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
              return null
            },
          },
        },
      }),
    },
  }
})

const { drizzleFindMany, drizzleFindOne } = await import('../src/runtime/server/utils/operations')

const event = {} as any

/** Runs a findMany with the given searchQuery and returns the captured drizzle query. */
async function runFindMany(searchQuery: any) {
  await drizzleFindMany({ event, collection: 'todos', params: {}, query: {}, searchQuery })
  return state.findMany.at(-1)
}

beforeEach(() => {
  state.findMany.length = 0
  state.findFirst.length = 0
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

  it('clamps a client limit above the bound', async () => {
    const q = await runFindMany({ limit: 5000 })
    expect(q.limit).toBe(10)
  })

  it('rejects negative or non-integer limits with 400', async () => {
    await expect(runFindMany({ limit: -1 })).rejects.toMatchObject({ statusCode: 400 })
    await expect(runFindMany({ limit: 1.5 })).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('findMany — keys bound', () => {
  it('accepts up to maxKeys keys', async () => {
    const q = await runFindMany({ keys: [1, 2, 3] })
    expect(q.where).toBeTruthy()
  })

  it('rejects more than maxKeys keys with 400', async () => {
    await expect(runFindMany({ keys: [1, 2, 3, 4] })).rejects.toMatchObject({ statusCode: 400 })
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
    await new Promise<void>(resolve => server.listen(0, resolve))
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
  })

  it('rejects a non-array operations payload with 400', async () => {
    const send = await bootBatchServer()
    const response = await send({ nope: true })
    expect(response.status).toBe(400)
  })

  it('processes a batch within the bound', async () => {
    const send = await bootBatchServer()
    const response = await send([
      { type: 'fetchFirst', collection: 'todos', key: '1', searchQuery: {} },
      { type: 'fetchFirst', collection: 'todos', key: '2', searchQuery: {} },
    ])
    expect(response.status).toBe(200)
    const { results } = SuperJSON.parse<any>(await response.text())
    expect(results).toHaveLength(2)
    expect(results.every((r: any) => r.ok)).toBe(true)
  })
})
