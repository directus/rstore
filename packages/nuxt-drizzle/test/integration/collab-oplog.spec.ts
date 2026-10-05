import type { DocNodeRecord } from '@rstore/multiplayer/ot'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeOpLogStoreContract } from '#test-utils/collab/opLogStoreContract'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createDrizzleOpLogStore } from '../../src/runtime/collab-oplog'

/** The app's node table: an ordinary rstore collection with the record columns. */
const docNodes = sqliteTable('doc_nodes', {
  id: text('id').notNull(),
  docId: text('doc_id').notNull(),
  parentId: text('parent_id'),
  orderKey: text('order_key').notNull(),
  type: text('type').notNull(),
  attrs: text('attrs', { mode: 'json' }).notNull(),
  content: text('content', { mode: 'json' }),
  deleted: integer('deleted', { mode: 'boolean' }).notNull(),
  version: integer('version').notNull(),
}, table => [primaryKey({ columns: [table.docId, table.id] })])

const collabOps = sqliteTable('collab_ops', {
  docId: text('doc_id').notNull(),
  version: integer('version').notNull(),
  clientId: text('client_id').notNull(),
  seq: integer('seq').notNull(),
  userId: text('user_id'),
  ops: text('ops', { mode: 'json' }).notNull(),
  time: integer('time').notNull(),
}, table => [
  primaryKey({ columns: [table.docId, table.version] }),
  uniqueIndex('collab_ops_submission').on(table.docId, table.clientId, table.seq),
])

const collabDocs = sqliteTable('collab_docs', {
  docId: text('doc_id').primaryKey(),
  head: integer('head').notNull(),
  floor: integer('floor').notNull(),
})

const collabOutbox = sqliteTable('collab_outbox', {
  docId: text('doc_id').notNull(),
  version: integer('version').notNull(),
})

const DDL = [
  // Readers never block a committing writer (with a rollback journal, a COMMIT can fail while another connection reads).
  'PRAGMA journal_mode = WAL',
  'CREATE TABLE doc_nodes (id TEXT NOT NULL, doc_id TEXT NOT NULL, parent_id TEXT, order_key TEXT NOT NULL, type TEXT NOT NULL, attrs TEXT NOT NULL, content TEXT, deleted INTEGER NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (doc_id, id))',
  'CREATE TABLE collab_ops (doc_id TEXT NOT NULL, version INTEGER NOT NULL, client_id TEXT NOT NULL, seq INTEGER NOT NULL, user_id TEXT, ops TEXT NOT NULL, time INTEGER NOT NULL, PRIMARY KEY (doc_id, version))',
  'CREATE UNIQUE INDEX collab_ops_submission ON collab_ops (doc_id, client_id, seq)',
  'CREATE TABLE collab_docs (doc_id TEXT PRIMARY KEY, head INTEGER NOT NULL, floor INTEGER NOT NULL)',
  'CREATE TABLE collab_outbox (doc_id TEXT NOT NULL, version INTEGER NOT NULL)',
]

/** A fresh database with the three tables. */
async function createDatabase() {
  // A temporary file: libsql runs each transaction of a `:memory:` database on a new, empty connection.
  const dir = mkdtempSync(join(tmpdir(), 'rstore-oplog-'))
  const client = createClient({ url: `file:${join(dir, 'db.sqlite')}` })
  onTestFinished(() => {
    client.close()
    rmSync(dir, { recursive: true, force: true })
  })
  for (const statement of DDL) {
    await client.execute(statement)
  }
  return drizzle(client)
}

const tables = { nodes: docNodes, ops: collabOps, docs: collabDocs }

describeOpLogStoreContract('createDrizzleOpLogStore (libsql)', async (retention) => {
  const db = await createDatabase()
  let now = 0
  const store = createDrizzleOpLogStore({ db, tables, retention, now: () => now })
  return {
    store,
    seed: async (docId: string, nodes: DocNodeRecord[], version = 0) => {
      await db.insert(docNodes).values(nodes)
      await db.insert(collabDocs).values({ docId, head: version, floor: version })
    },
    setNow: (value: number) => {
      now = value
    },
  }
})

describe('createDrizzleOpLogStore', () => {
  it('reports committed appends, so the rows can be published to realtime subscribers', async () => {
    const db = await createDatabase()
    const appended: unknown[] = []
    const store = createDrizzleOpLogStore({
      db,
      tables,
      onAppend: (docId, entry, nodes) => {
        appended.push({ docId, version: entry.version, nodes: nodes.map(node => node.id) })
      },
    })
    const node = { id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [], deleted: false, version: 1 }
    expect(await store.append('doc', { version: 1, clientId: 'c', seq: 1, ops: [] }, [node])).toBe(true)
    expect(await store.append('doc', { version: 1, clientId: 'c', seq: 2, ops: [] }, [node])).toBe(false)
    expect(appended).toEqual([{ docId: 'doc', version: 1, nodes: ['p1'] }])
  })

  it('rechecks append access and persists outbox rows in its transaction', async () => {
    const db = await createDatabase()
    let attempts = 0
    let retried = false
    const guardContexts: unknown[] = []
    const store = createDrizzleOpLogStore({
      db,
      tables,
      isTransientError: error => (error as { code?: string }).code === '40001',
      transaction: task => db.transaction(async (tx) => {
        attempts++
        const result = await task(tx)
        if (!retried) {
          retried = true
          throw Object.assign(new Error('retry'), { code: '40001' })
        }
        return result
      }),
      appendGuard: (context) => {
        guardContexts.push(context.appendContext)
        return context.appendContext === 'revoked' ? 'unavailable' : undefined
      },
      persistAppend: async (context) => {
        await context.tx.insert(collabOutbox).values({ docId: context.docId, version: context.entry.version })
      },
    })
    const node = { id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [], deleted: false, version: 1 }
    await expect(store.append('doc', { version: 1, clientId: 'c', seq: 1, ops: [] }, [node], 'revoked')).rejects.toMatchObject({ reason: 'unavailable' })
    expect(await db.select().from(collabOps)).toEqual([])
    expect(await db.select().from(collabOutbox)).toEqual([])
    expect(await store.append('doc', { version: 1, clientId: 'c', seq: 1, ops: [] }, [node], { principal: 'u1' })).toBe(true)
    expect(attempts).toBe(3)
    expect(guardContexts).toEqual(['revoked', { principal: 'u1' }, { principal: 'u1' }])
    expect(await db.select().from(collabOutbox)).toEqual([{ docId: 'doc', version: 1 }])
  })

  it('does not change a committed append result when post-commit publication fails', async () => {
    const db = await createDatabase()
    const errors: unknown[] = []
    const store = createDrizzleOpLogStore({
      db,
      tables,
      onAppend: () => {
        throw new Error('publish failed')
      },
      onAppendError: error => errors.push(error),
    })
    expect(await store.append('doc', { version: 1, clientId: 'c', seq: 1, ops: [] }, [])).toBe(true)
    expect(errors).toHaveLength(1)
    expect(await store.head('doc')).toBe(1)
  })
})
