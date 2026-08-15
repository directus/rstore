import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { createApp, createRouter, toNodeListener } from 'h3'
import SuperJSON from 'superjson'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The read routes used to guard the *result* of `SuperJSON.parse(query.superjson)`
// instead of its input, so a request without the param (a direct browser hit, a
// probe, curl) crashed with `"undefined" is not valid JSON` — a 500 thrown before
// the `*.get.before` permission hooks ever ran, and therefore before auth could
// answer with a 401. Malformed superjson crashed the same way.

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
  return {
    dialect: 'sqlite',
    tables: { todos },
    collectionMetas: {
      todos: { table: 'todos', primaryKeys: ['id'] },
    },
    collectionRelations: {
      todos: {},
    },
    queryLimits: {},
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
              return { id: 1, title: 'todo' }
            },
          },
        },
      }),
    },
  }
})

const { parseSearchQuery } = await import('../src/runtime/server/utils/search-query')

const servers: Array<ReturnType<typeof createServer>> = []

afterAll(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
})

/** Boots a throwaway h3 app exposing the real read handlers behind a router (so `getRouterParams` resolves). */
async function bootReadServer() {
  const findManyHandler = (await import('../src/runtime/server/api/index.get')).default
  const findOneHandler = (await import('../src/runtime/server/api/[key]/index.get')).default
  const router = createRouter()
  router.get('/api/rstore/:collection', findManyHandler)
  router.get('/api/rstore/:collection/:key', findOneHandler)
  const app = createApp()
  app.use(router)
  const server = createServer(toNodeListener(app))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return async (path: string) => fetch(`http://127.0.0.1:${port}${path}`)
}

beforeEach(() => {
  state.findMany.length = 0
  state.findFirst.length = 0
})

describe('read routes — missing or invalid `superjson`', () => {
  it('treats a missing param as an empty search query on the list route', async () => {
    const send = await bootReadServer()

    const bare = await send('/api/rstore/todos')
    expect(bare.status).toBe(200)
    const bareQuery = state.findMany.at(-1)

    const explicit = await send(`/api/rstore/todos?superjson=${encodeURIComponent(SuperJSON.stringify({}))}`)
    expect(explicit.status).toBe(200)
    expect(bareQuery).toEqual(state.findMany.at(-1))
  })

  it('treats a missing param as an empty search query on the by-key route', async () => {
    const send = await bootReadServer()
    const response = await send('/api/rstore/todos/1')
    expect(response.status).toBe(200)
    expect(state.findFirst).toHaveLength(1)
  })

  it('rejects malformed superjson with 400 on both read routes', async () => {
    const send = await bootReadServer()
    expect((await send('/api/rstore/todos?superjson=not-json')).status).toBe(400)
    expect((await send('/api/rstore/todos/1?superjson=not-json')).status).toBe(400)
    expect(state.findMany).toHaveLength(0)
    expect(state.findFirst).toHaveLength(0)
  })
})

describe('parseSearchQuery', () => {
  it('defaults to an empty object when there is nothing to parse', () => {
    expect(parseSearchQuery(undefined)).toEqual({})
    expect(parseSearchQuery('')).toEqual({})
    expect(parseSearchQuery(SuperJSON.stringify(null))).toEqual({})
  })

  it('parses a superjson payload, preserving rich values', () => {
    const date = new Date('2020-01-01T00:00:00.000Z')
    expect(parseSearchQuery(SuperJSON.stringify({ limit: 5, where: { createdAt: date } }))).toEqual({
      limit: 5,
      where: { createdAt: date },
    })
  })

  it('rejects malformed, non-string and non-object payloads with 400', () => {
    expect(() => parseSearchQuery('not-json')).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => parseSearchQuery(['a', 'b'])).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => parseSearchQuery(SuperJSON.stringify([1, 2]))).toThrow(expect.objectContaining({ statusCode: 400 }))
  })
})
