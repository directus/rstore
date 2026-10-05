import type { DocNodeRecord } from '@rstore/multiplayer/ot'
import { describeOpLogStoreContract } from '#test-utils/collab/opLogStoreContract'
import { PGlite } from '@electric-sql/pglite'
import { bigint, boolean, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createDrizzleOpLogStore } from '../../src/runtime/collab-oplog'

/** PostgreSQL-shaped collaboration rows, including JSONB, booleans and bigint time. */
const docNodes = pgTable('doc_nodes', {
  id: text('id').notNull(),
  docId: text('doc_id').notNull(),
  parentId: text('parent_id'),
  orderKey: text('order_key').notNull(),
  type: text('type').notNull(),
  attrs: jsonb('attrs').notNull(),
  content: jsonb('content'),
  deleted: boolean('deleted').notNull(),
  version: integer('version').notNull(),
}, table => [primaryKey({ columns: [table.docId, table.id] })])

const collabOps = pgTable('collab_ops', {
  docId: text('doc_id').notNull(),
  version: integer('version').notNull(),
  clientId: text('client_id').notNull(),
  seq: integer('seq').notNull(),
  userId: text('user_id'),
  ops: jsonb('ops').notNull(),
  time: bigint('time', { mode: 'number' }).notNull(),
}, table => [
  primaryKey({ columns: [table.docId, table.version] }),
  uniqueIndex('collab_ops_submission').on(table.docId, table.clientId, table.seq),
])

const collabDocs = pgTable('collab_docs', {
  docId: text('doc_id').primaryKey(),
  head: integer('head').notNull(),
  floor: integer('floor').notNull(),
})

const DDL = `
  CREATE TABLE doc_nodes (id text NOT NULL, doc_id text NOT NULL, parent_id text, order_key text NOT NULL, type text NOT NULL, attrs jsonb NOT NULL, content jsonb, deleted boolean NOT NULL, version integer NOT NULL, PRIMARY KEY (doc_id, id));
  CREATE TABLE collab_ops (doc_id text NOT NULL, version integer NOT NULL, client_id text NOT NULL, seq integer NOT NULL, user_id text, ops jsonb NOT NULL, time bigint NOT NULL, PRIMARY KEY (doc_id, version));
  CREATE UNIQUE INDEX collab_ops_submission ON collab_ops (doc_id, client_id, seq);
  CREATE TABLE collab_docs (doc_id text PRIMARY KEY, head integer NOT NULL, floor integer NOT NULL);
`

/** Fresh embedded PostgreSQL with the exact Drizzle PGlite driver. */
async function createDatabase() {
  const client = new PGlite()
  onTestFinished(() => client.close())
  await client.exec(DDL)
  return drizzle(client)
}

const tables = { nodes: docNodes, ops: collabOps, docs: collabDocs }

describeOpLogStoreContract('createDrizzleOpLogStore (PGlite/PostgreSQL)', async (retention) => {
  const db = await createDatabase()
  let now = 0
  const store = createDrizzleOpLogStore({ db, tables, retention, now: () => now, isTransientError: error => ['40001', '40P01'].includes((error as { code?: string }).code ?? '') })
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

describe('createDrizzleOpLogStore (PGlite/PostgreSQL)', () => {
  it('handles an absent-head race without duplicate operations', async () => {
    const db = await createDatabase()
    const left = createDrizzleOpLogStore({ db, tables })
    const right = createDrizzleOpLogStore({ db, tables })
    const outcomes = await Promise.all([
      left.append('new-doc', { version: 1, clientId: 'left', seq: 1, ops: [] }, []),
      right.append('new-doc', { version: 1, clientId: 'right', seq: 1, ops: [] }, []),
    ])
    expect(outcomes.filter(Boolean)).toHaveLength(1)
    expect(await left.head('new-doc')).toBe(1)
    expect(await db.select().from(collabOps)).toHaveLength(1)
  })

  it('round-trips PostgreSQL JSONB, booleans and bigint time', async () => {
    const db = await createDatabase()
    const store = createDrizzleOpLogStore({ db, tables, now: () => 1_700_000_000_000 })
    const node = { id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: { marks: ['bold'] }, content: [{ insert: 'hello' }], deleted: false, version: 1 }
    expect(await store.append('doc', { version: 1, clientId: 'c', seq: 1, ops: [] }, [node])).toBe(true)
    expect(await db.select().from(docNodes)).toEqual([node])
    expect(await db.select().from(collabOps)).toMatchObject([{ ops: [], time: 1_700_000_000_000 }])
  })
})
