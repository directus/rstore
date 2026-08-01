import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNoMatch, getWsHooks, makeMessage, makePeer, waitFor } from './utils/ws'

// `allowTables` must gate EVERY client-reachable path, not only the REST
// before-hooks: relation `include`s and realtime subscriptions used to bypass
// the allow-list entirely and stream/return rows from denied tables.

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
      todos: { secrets: { to: { secrets: { on: { todoId: 'id' } } } } },
      secrets: {},
    },
    queryLimits: {},
    useDrizzles: {
      default: () => {
        throw new Error('no db in this test')
      },
    },
  }
})

/**
 * Fresh module graph per test — the allow-list is module-level state, so
 * each scenario must start from "no allow-list configured".
 */
async function setup() {
  vi.resetModules()
  // @ts-expect-error virtual module (mocked above)
  const serverUtilsMock: any = await import('$rstore-drizzle-server-utils.js')
  const utils = await import('../src/runtime/server/utils/index')
  const hooks = await import('../src/runtime/server/utils/hooks')
  const pubsub = await import('../src/runtime/server/utils/pubsub')
  pubsub.setPubSub(pubsub.createMemoryPubSub())
  return {
    tables: serverUtilsMock.tables,
    utils,
    hooks,
    pubsub,
  }
}

describe('allowTables — default open', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('exposes every collection when no allow-list is configured', async () => {
    const { utils } = await setup()
    expect(utils.getDrizzleTableFromCollection('todos').table).toBeTruthy()
    expect(utils.getDrizzleTableFromCollection('secrets').table).toBeTruthy()
  })
})

describe('allowTables — REST/batch choke point', () => {
  it('rejects a denied collection with 403 at table resolution', async () => {
    const { utils, hooks, tables } = await setup()
    hooks.allowTables([tables.todos])

    expect(utils.getDrizzleTableFromCollection('todos').table).toBeTruthy()
    expect(() => utils.getDrizzleTableFromCollection('secrets')).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('accumulates collections across multiple calls', async () => {
    const { utils, hooks, tables } = await setup()
    hooks.allowTables([tables.todos])
    hooks.allowTables([tables.secrets])
    expect(utils.getDrizzleTableFromCollection('secrets').table).toBeTruthy()
  })
})

describe('allowTables — relation includes', () => {
  it('rejects `include: { relation: true }` targeting a denied collection', async () => {
    const { utils, hooks, tables } = await setup()
    hooks.allowTables([tables.todos])

    expect(() => utils.convertIncludeToDrizzleWith('todos', { secrets: true })).toThrowError(
      expect.objectContaining({ statusCode: 403 }),
    )
  })

  it('rejects an include with options targeting a denied collection', async () => {
    const { utils, hooks, tables } = await setup()
    hooks.allowTables([tables.todos])

    expect(() => utils.convertIncludeToDrizzleWith('todos', {
      secrets: { where: { operator: 'eq', field: 'id', value: 1 } },
    })).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })

  it('still converts includes when the target is allowed', async () => {
    const { utils, hooks, tables } = await setup()
    hooks.allowTables([tables.todos, tables.secrets])

    expect(utils.convertIncludeToDrizzleWith('todos', { secrets: true })).toEqual({ secrets: true })
  })
})

describe('allowTables — realtime subscriptions', () => {
  it('rejects a subscription to a denied collection and never streams it', async () => {
    const { hooks, tables, pubsub } = await setup()
    hooks.allowTables([tables.todos])

    const wsHooks = await getWsHooks()
    const peer = makePeer()
    wsHooks.open(peer)
    await wsHooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'secrets' },
    }))

    const rejected = peer.sent.find((s: any) => s?.subscription?.action === 'rejected')
    expect(rejected).toBeTruthy()
    expect(rejected.subscription.reason).toBe('collection-not-allowed')

    // Even though publishes still happen server-side, the denied peer must
    // never receive them.
    pubsub.getPubSub().publish('update', {
      type: 'created',
      collection: 'secrets',
      key: undefined as any,
      record: { id: 1, token: 'hunter2' },
    })
    await expectNoMatch(() => peer.sent.find((s: any) => s?.update || s?.updates))
  })

  it('still delivers updates for allowed collections', async () => {
    const { hooks, tables, pubsub } = await setup()
    hooks.allowTables([tables.todos])

    const wsHooks = await getWsHooks()
    const peer = makePeer()
    wsHooks.open(peer)
    await wsHooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    expect(peer.sent.find((s: any) => s?.subscription?.action === 'rejected')).toBeUndefined()

    pubsub.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })
    await waitFor(() => peer.sent.find((s: any) => s?.update || s?.updates))
  })

  it('server-side publish helpers keep working for denied collections', async () => {
    // `publishRstoreDrizzleRealtimeUpdate` is server-initiated: the exposure
    // gate is at subscribe time, so internal publishes must not throw.
    const { hooks, tables } = await setup()
    hooks.allowTables([tables.todos])
    const { setDefaultClock, createHLCClock } = await import('@rstore/core')
    setDefaultClock(createHLCClock('test-node'))
    const realtime = await import('../src/runtime/server/utils/realtime')
    expect(() => realtime.publishRstoreDrizzleRealtimeUpdate({
      type: 'created',
      collection: 'secrets',
      record: { id: 1, token: 's' },
    })).not.toThrow()
  })
})
