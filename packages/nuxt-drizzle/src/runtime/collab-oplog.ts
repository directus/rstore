/**
 * Drizzle `OpLogStore` for the rich-text OT sequencer of
 * `@rstore/multiplayer/server` (experimental).
 *
 * Import it from `@rstore/nuxt-drizzle/collab`. It has no Nuxt or Nitro
 * dependency: pass a Drizzle database and three tables. Node rows live in an
 * ordinary table (an rstore collection), so documents stay queryable and the
 * realtime publisher can emit them to non-collab subscribers.
 */
import type { DocNodeRecord, DocOp } from '@rstore/multiplayer/ot'
import type { CollabRejectReason } from '@rstore/multiplayer/protocol'
import type { OpLogEntry, OpLogRetention, OpLogStore } from '@rstore/multiplayer/server'
import type { DrizzleOpLogAppendContext, DrizzleOpLogMapping, DrizzleOpLogTables } from './collab-oplog-mapping'
import { compactionFloor, DEFAULT_OP_LOG_RETENTION, OpLogAppendRejected } from '@rstore/multiplayer/server'
import { and, asc, eq, gt, gte, lt, lte, min } from 'drizzle-orm'
import { createDefaultDrizzleOpLogMapping } from './collab-oplog-mapping'

export type { DrizzleOpLogAppendContext, DrizzleOpLogMapping, DrizzleOpLogTables } from './collab-oplog-mapping'

/** Options of {@link createDrizzleOpLogStore}. */
export interface DrizzleOpLogStoreOptions {
  /**
   * Drizzle database with async transactions (libsql, node-postgres,
   * postgres.js, mysql2…). Synchronous drivers (better-sqlite3) and drivers
   * without transactions (D1) are not supported.
   */
  db: any
  tables: DrizzleOpLogTables
  /** Maps non-canonical table column/property names and application row values. */
  mapping?: DrizzleOpLogMapping
  /** @default max(30 days, last 100 000 ops) */
  retention?: OpLogRetention
  /** Clock of entry times and age-based retention. @default Date.now */
  now?: () => number
  /**
   * Whether a failed transaction may succeed when retried (a lock held by
   * another connection). Retried up to 8 times with a growing delay.
   * @default SQLite `SQLITE_BUSY` / "database is locked" errors
   */
  isTransientError?: (error: unknown) => boolean
  /** Owns transaction lifetime, e.g. tenant/RLS setup around Factory's `withTransaction`. */
  transaction?: DrizzleOpLogTransactionExecutor
  /** Rechecks current access after the transaction begins and before rows change. */
  appendGuard?: (context: DrizzleOpLogAppendContext) => CollabRejectReason | undefined | void | Promise<CollabRejectReason | undefined | void>
  /** Persists an outbox or other durable side effect after rows change, before commit. */
  persistAppend?: (context: DrizzleOpLogAppendContext) => void | Promise<void>
  /**
   * Called after an append is committed, with the node rows it wrote: for
   * example to publish them to realtime subscribers that are not collab
   * clients (document lists, search) with `publishRstoreDrizzleRealtimeUpdate`.
   */
  onAppend?: (docId: string, entry: OpLogEntry, nodes: DocNodeRecord[]) => void | Promise<void>
  /** Reports a post-commit publication failure without changing a committed append result. */
  onAppendError?: (error: unknown, docId: string, entry: OpLogEntry, nodes: DocNodeRecord[]) => void
}

/** Runs a callback in an application-owned transaction. */
export type DrizzleOpLogTransactionExecutor = <T>(task: (tx: any) => Promise<T>) => Promise<T>

/** SQLite lock contention (libsql opens a connection per transaction and has no busy timeout). */
function isSqliteBusy(error: unknown): boolean {
  for (let current = error as { code?: unknown, message?: unknown, cause?: unknown } | undefined, depth = 0; current && depth < 5; current = current.cause as typeof current, depth++) {
    if (current.code === 'SQLITE_BUSY' || (typeof current.message === 'string' && current.message.includes('database is locked'))) {
      return true
    }
  }
  return false
}

/** The append lost the compare-and-set: another writer appended this version first. */
class VersionTaken extends Error {}

/** Runs post-commit publication without turning a committed append into a failure. */
function notifyAppend(options: DrizzleOpLogStoreOptions, docId: string, entry: OpLogEntry, nodes: DocNodeRecord[]): void {
  const report = (error: unknown) => {
    try {
      options.onAppendError?.(error, docId, entry, nodes)
    }
    catch {
      // A reporting failure must not turn a durable success into a retry.
    }
  }
  try {
    void Promise.resolve(options.onAppend?.(docId, entry, nodes)).catch(report)
  }
  catch (error) {
    report(error)
  }
}

/** Node record from a row, without the table's extra columns. */
function toRecord(row: Record<string, any>): DocNodeRecord {
  return {
    id: row.id,
    docId: row.docId,
    parentId: row.parentId ?? null,
    orderKey: row.orderKey,
    type: row.type,
    attrs: row.attrs ?? {},
    content: row.content ?? null,
    deleted: !!row.deleted,
    version: Number(row.version),
  }
}

/** Op log entry from a row. */
function toEntry(row: Record<string, any>): OpLogEntry {
  return {
    version: Number(row.version),
    clientId: row.clientId,
    seq: Number(row.seq),
    ...(row.userId != null ? { userId: row.userId } : {}),
    ops: row.ops as DocOp[],
    time: Number(row.time),
  }
}

/**
 * Creates an `OpLogStore` over Drizzle tables. `append` runs in one
 * transaction: it checks the head, inserts the op log row (whose unique
 * `(docId, version)` also catches a concurrent writer), moves the head and
 * upserts the node rows. `compact` erases old operation content, preserves
 * submission identities, and raises the floor; node rows are never deleted.
 */
export function createDrizzleOpLogStore(options: DrizzleOpLogStoreOptions): OpLogStore & { compact: (docId: string) => Promise<void> } {
  const { db, tables: { nodes, ops, docs } } = options
  const mapping = options.mapping ?? createDefaultDrizzleOpLogMapping(options.tables)
  const { nodes: nodeColumns, ops: opColumns, docs: docColumns } = mapping.columns
  const now = options.now ?? Date.now
  const retention = { ...DEFAULT_OP_LOG_RETENTION, ...options.retention }
  const isTransient = options.isTransientError ?? isSqliteBusy
  const executeTransaction: DrizzleOpLogTransactionExecutor = options.transaction ?? (task => db.transaction(task))

  /** Runs a transaction, retrying it while it fails on lock contention. */
  const transaction = async <T>(task: (tx: any) => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await executeTransaction(task)
      }
      catch (error) {
        if (attempt >= 8 || !isTransient(error)) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 2 ** attempt + Math.random() * 5))
      }
    }
  }

  /** The document row, if any. */
  const docRow = async (executor: any, docId: string): Promise<{ head: number, floor: number } | undefined> => {
    const [row] = await executor.select({ head: docColumns.head, floor: docColumns.floor }).from(docs).where(eq(docColumns.docId, docId)).limit(1)
    return row && { head: Number(row.head), floor: Number(row.floor) }
  }

  const opSelection = { version: opColumns.version, clientId: opColumns.clientId, seq: opColumns.seq, userId: opColumns.userId, ops: opColumns.ops, time: opColumns.time }
  const nodeSelection = { id: nodeColumns.id, docId: nodeColumns.docId, parentId: nodeColumns.parentId, orderKey: nodeColumns.orderKey, type: nodeColumns.type, attrs: nodeColumns.attrs, content: nodeColumns.content, deleted: nodeColumns.deleted, version: nodeColumns.version }

  const findSubmission: OpLogStore['findSubmission'] = async (docId, clientId, seq) => {
    const [row] = await db.select(opSelection).from(ops).where(and(eq(opColumns.docId, docId), eq(opColumns.clientId, clientId), eq(opColumns.seq, seq))).limit(1)
    return row ? toEntry(row) : undefined
  }

  /** Updates existing node rows and inserts new ones within one document scope. */
  const upsertNodes = async (context: DrizzleOpLogAppendContext) => {
    if (!context.nodes.length) {
      return
    }
    for (const node of context.nodes) {
      if (node.docId !== context.docId) {
        throw new Error(`[rstore ot] node ${node.id} belongs to another document`)
      }
      const [existing] = await context.tx.select({ id: nodeColumns.id }).from(nodes).where(and(eq(nodeColumns.docId, node.docId), eq(nodeColumns.id, node.id))).limit(1)
      if (existing) {
        await context.tx.update(nodes).set(mapping.nodeValues(context, node)).where(and(eq(nodeColumns.docId, node.docId), eq(nodeColumns.id, node.id)))
      }
      else {
        await context.tx.insert(nodes).values(mapping.nodeValues(context, node))
      }
    }
  }

  const store: OpLogStore & { compact: (docId: string) => Promise<void> } = {
    head: async docId => (await docRow(db, docId))?.head ?? 0,
    floor: async docId => (await docRow(db, docId))?.floor ?? 0,
    async range(docId, after, upTo) {
      const conditions = [eq(opColumns.docId, docId), gt(opColumns.version, Math.max(after, await store.floor(docId)))]
      if (upTo !== undefined) {
        conditions.push(lte(opColumns.version, upTo))
      }
      const rows = await db.select(opSelection).from(ops).where(and(...conditions)).orderBy(asc(opColumns.version))
      return rows.map(toEntry)
    },
    findSubmission,
    async loadNodes(docId) {
      const rows = await db.select(nodeSelection).from(nodes).where(eq(nodeColumns.docId, docId))
      return rows.map(toRecord)
    },
    async append(docId, entry, records, appendContext) {
      const storedEntry = { ...entry, time: entry.time ?? now() }
      try {
        await transaction(async (tx: any) => {
          const context: DrizzleOpLogAppendContext = { tx, docId, entry: storedEntry, nodes: records, ...(appendContext === undefined ? {} : { appendContext }) }
          const refusal = await options.appendGuard?.(context)
          if (refusal) {
            throw new OpLogAppendRejected(refusal)
          }
          const doc = await docRow(tx, docId)
          if (storedEntry.version !== (doc?.head ?? 0) + 1) {
            throw new VersionTaken()
          }
          await tx.insert(ops).values(mapping.operationValues(context))
          if (doc) {
            await tx.update(docs).set(mapping.documentValues(docId, { head: storedEntry.version }, context)).where(eq(docColumns.docId, docId))
          }
          else {
            await tx.insert(docs).values(mapping.documentValues(docId, { head: storedEntry.version, floor: 0 }, context))
          }
          await upsertNodes(context)
          await options.persistAppend?.(context)
        })
        notifyAppend(options, docId, storedEntry, records)
        return true
      }
      catch (error) {
        if (error instanceof VersionTaken) {
          return false
        }
        if (error instanceof OpLogAppendRejected) {
          throw error
        }
        // A unique violation from a concurrent writer: the version (or this
        // submission) is now taken, and the sequencer rebases and retries.
        if (await store.head(docId) >= entry.version || await findSubmission(docId, entry.clientId, entry.seq)) {
          return false
        }
        throw error
      }
    },
    async compact(docId) {
      await transaction(async (tx: any) => {
        const doc = await docRow(tx, docId)
        if (!doc) {
          return
        }
        const [recent] = await tx.select({ version: min(opColumns.version) }).from(ops).where(and(eq(opColumns.docId, docId), gte(opColumns.time, now() - retention.maxAgeMs)))
        const firstRecentVersion = recent?.version == null ? undefined : Number(recent.version)
        const floor = compactionFloor({ head: doc.head, floor: doc.floor, firstRecentVersion }, retention)
        if (floor <= doc.floor) {
          return
        }
        // The conditional write makes stale compactors unable to lower an
        // already-raised floor. Op content is erased but identity remains.
        await tx.update(docs).set(mapping.documentValues(docId, { floor })).where(and(eq(docColumns.docId, docId), lt(docColumns.floor, floor)))
        await tx.update(ops).set(mapping.compactedOperationValues()).where(and(eq(opColumns.docId, docId), lte(opColumns.version, floor)))
      })
    },
  }
  return store
}
