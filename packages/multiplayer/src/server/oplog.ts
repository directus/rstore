import type { DocNodeRecord, DocOp, DocState } from '../ot/types.js'
import type { CollabRejectReason } from '../protocol/collab.js'
import { createDocState } from '../ot/doc/state.js'

/** One sequenced transaction in a document's op log. */
export interface OpLogEntry {
  /** Document version this entry produced (head + 1 when appended). */
  version: number
  clientId: string
  /** Client sequence number: `(clientId, seq)` identifies a submission. */
  seq: number
  userId?: string
  /** Ops as sequenced (transformed to the head they were appended to). */
  ops: DocOp[]
  /** Wall-clock time of the append (ms), used by time-based retention. */
  time?: number
}

/**
 * Persistence of one sequencer: the op log plus the current node rows.
 * Every method is async so a database (Postgres, Durable Object storage)
 * can implement it. The sequencer itself keeps no per-document state, so
 * any instance holding the document's write lease can call it.
 */
export interface OpLogStore {
  /** Current version of the document (0 when empty). */
  head: (docId: string) => Promise<number>
  /**
   * Oldest base version that can still be rebased: entries with a version
   * above it are all retained. A transaction based below it is rejected
   * with `history-truncated`.
   */
  floor: (docId: string) => Promise<number>
  /** Entries with `after < version <= upTo` (default: the head), in order. */
  range: (docId: string, after: number, upTo?: number) => Promise<OpLogEntry[]>
  /** The entry of a submission, if it was already sequenced (idempotent resubmit). */
  findSubmission: (docId: string, clientId: string, seq: number) => Promise<OpLogEntry | undefined>
  /** Every node record of the document at the head (deleted ones included). */
  loadNodes: (docId: string) => Promise<DocNodeRecord[]>
  /**
   * Appends an entry and upserts the changed node rows atomically, if and
   * only if `entry.version === head + 1` (compare-and-set). Returns `false`
   * when another writer appended first; the caller rebases and retries.
   */
  append: (docId: string, entry: OpLogEntry, nodes: DocNodeRecord[], appendContext?: unknown) => Promise<boolean>
  /**
   * Drops entries outside the retention window and raises the floor (see
   * {@link compactionFloor}). Optional: `sequenceTransaction` calls it every
   * `compactEvery` versions when present. Node rows are never removed, soft
   * deleted ones included (undo and late transactions may still address them).
   */
  compact?: (docId: string) => Promise<void>
}

/** A durable-store refusal that the sequencer turns into a client rejection. */
export class OpLogAppendRejected extends Error {
  constructor(readonly reason: CollabRejectReason) {
    super(`[rstore ot] append rejected: ${reason}`)
  }
}

/** Op log retention: keep at least the last `minOps` entries and everything newer than `maxAgeMs`. */
export interface OpLogRetention {
  /** @default 100_000 */
  minOps?: number
  /** @default 30 days */
  maxAgeMs?: number
}

/** Default retention: max(30 days, last 100 000 ops). */
export const DEFAULT_OP_LOG_RETENTION: Required<OpLogRetention> = { minOps: 100_000, maxAgeMs: 30 * 24 * 3600_000 }

/**
 * Floor an op log can be compacted to: entries up to it may be dropped. An
 * entry is dropped only when it is both older than `maxAgeMs` and not among
 * the last `minOps` (versions are contiguous, so the dropped entries are a
 * prefix of the log). The floor never goes down.
 *
 * @param log Op log bounds of the document.
 * @param log.head Current version.
 * @param log.floor Current floor.
 * @param log.firstRecentVersion Lowest retained version appended at or
 * after `now - maxAgeMs` (`undefined` when there is none).
 * @param retention Retention window.
 */
export function compactionFloor(log: { head: number, floor: number, firstRecentVersion: number | undefined }, retention: OpLogRetention = {}): number {
  const minOps = retention.minOps ?? DEFAULT_OP_LOG_RETENTION.minOps
  const byCount = log.head - minOps
  const byAge = (log.firstRecentVersion ?? log.head + 1) - 1
  return Math.max(log.floor, Math.min(byCount, byAge))
}

/** Options of `createMemoryOpLogStore`. */
export interface MemoryOpLogStoreOptions {
  retention?: OpLogRetention
  /** Clock for entry times and age-based retention. @default Date.now */
  now?: () => number
}

/** In-memory `OpLogStore`, plus helpers for tests and single-process servers. */
export interface MemoryOpLogStore extends OpLogStore {
  /** Creates (or replaces) a document with initial nodes at a version. */
  seed: (docId: string, nodes: DocNodeRecord[], version?: number) => void
  /** The current document state (a copy). */
  state: (docId: string) => DocState
  /** Drops entries outside the retention window and raises the floor (synchronously). */
  compact: (docId: string) => Promise<void>
}

/** Per-document data of the memory store. */
interface MemoryDoc {
  nodes: Map<string, DocNodeRecord>
  log: OpLogEntry[]
  head: number
  floor: number
  submissions: Map<string, OpLogEntry>
}

/**
 * Op log kept in memory. Retention defaults to max(30 days, last 100 000
 * ops): an entry is dropped only when it is both older than `maxAgeMs` and
 * not among the last `minOps`. `sequenceTransaction` compacts every 1 000
 * versions by default.
 */
export function createMemoryOpLogStore(options: MemoryOpLogStoreOptions = {}): MemoryOpLogStore {
  const docs = new Map<string, MemoryDoc>()
  const now = options.now ?? Date.now
  const retention = { ...DEFAULT_OP_LOG_RETENTION, ...options.retention }
  const submissionKey = (clientId: string, seq: number) => `${clientId}\u0000${seq}`

  const doc = (docId: string): MemoryDoc => {
    let entry = docs.get(docId)
    if (!entry) {
      entry = { nodes: new Map(), log: [], head: 0, floor: 0, submissions: new Map() }
      docs.set(docId, entry)
    }
    return entry
  }

  const store: MemoryOpLogStore = {
    seed(docId, nodes, version = 0) {
      docs.set(docId, { nodes: new Map(nodes.map(node => [node.id, node])), log: [], head: version, floor: version, submissions: new Map() })
    },
    state: docId => createDocState(docId, doc(docId).nodes.values(), doc(docId).head),
    compact(docId) {
      const data = doc(docId)
      const cutoff = now() - retention.maxAgeMs
      const firstRecentVersion = data.log.find(entry => (entry.time ?? 0) >= cutoff)?.version
      const floor = compactionFloor({ head: data.head, floor: data.floor, firstRecentVersion }, retention)
      for (const entry of data.log.splice(0, floor - data.floor)) {
        // Keep only idempotency metadata. A resubmit must not recreate an
        // effect after history was compacted, while retained ops stay bounded.
        data.submissions.set(submissionKey(entry.clientId, entry.seq), { ...entry, ops: [] })
      }
      data.floor = floor
      return Promise.resolve()
    },
    head: async docId => doc(docId).head,
    floor: async docId => doc(docId).floor,
    async range(docId, after, upTo) {
      const data = doc(docId)
      const last = upTo ?? data.head
      // Versions are contiguous from floor + 1, so the slice is direct.
      return data.log.slice(Math.max(0, after - data.floor), Math.max(0, last - data.floor))
    },
    findSubmission: async (docId, clientId, seq) => doc(docId).submissions.get(submissionKey(clientId, seq)),
    loadNodes: async docId => [...doc(docId).nodes.values()],
    async append(docId, entry, nodes) {
      const data = doc(docId)
      if (entry.version !== data.head + 1) {
        return false
      }
      const stored = { ...entry, time: entry.time ?? now() }
      data.log.push(stored)
      data.head = entry.version
      data.submissions.set(submissionKey(entry.clientId, entry.seq), stored)
      for (const node of nodes) {
        data.nodes.set(node.id, node)
      }
      return true
    },
  }
  return store
}
