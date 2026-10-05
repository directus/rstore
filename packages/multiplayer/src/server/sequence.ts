import type { DocNodeRecord, DocOp, DocState, DocTransaction, TransformOptions } from '../ot/types.js'
import type { CollabRejectReason } from '../protocol/collab.js'
import type { OpLogEntry, OpLogStore } from './oplog.js'
import { applyDocOps } from '../ot/doc/apply.js'
import { createDocState } from '../ot/doc/state.js'
import { rebaseDocOps } from '../ot/doc/transform.js'
import { OtTransformConflict, OtValidationError } from '../ot/errors.js'
import { OpLogAppendRejected } from './oplog.js'

/** Context of a `filterOp` call: one transformed op, before it is applied. */
export interface CollabFilterOpContext {
  docId: string
  userId?: string
  role?: string
  clientId: string
  op: DocOp
  /** The node the op addresses, as it is before the op (undefined for new nodes). */
  node: DocNodeRecord | undefined
  /** Document before the op (earlier ops of the transaction applied). */
  state: DocState
}

/** Options of `sequenceTransaction`. */
export interface SequenceOptions {
  userId?: string
  role?: string
  /** Must match the clients' transform options. */
  transform?: TransformOptions
  /**
   * Permission check per transformed op. Return a reject reason (usually
   * `'forbidden'`) to refuse the whole transaction.
   */
  filterOp?: (context: CollabFilterOpContext) => CollabRejectReason | undefined | void
  /** Private authorization context forwarded only to the durable append. */
  appendContext?: unknown
  /** Compare-and-set retries when another writer appends first. @default 5 */
  maxAttempts?: number
  /**
   * Calls `store.compact` (when present) after appending a version that is
   * a multiple of this. `0` disables compaction. @default 1000
   */
  compactEvery?: number
}

/** Outcome of `sequenceTransaction`. */
export type SequenceResult
  = | {
    status: 'ok'
    entry: OpLogEntry
    /** Rows the entry changed, as appended. */
    nodes: DocNodeRecord[]
    /** Every row of the document before the entry (for per-peer redaction). */
    before: DocNodeRecord[]
  }
  | { status: 'duplicate', entry: OpLogEntry }
  | { status: 'rejected', reason: CollabRejectReason, resync?: boolean }

/**
 * Pure part of sequencing: rebases a transaction over the entries sequenced
 * since its base version (`opsSince`, in order). Throws
 * `OtTransformConflict` when the transaction cannot be kept.
 */
export function rebaseTransaction(tx: Pick<DocTransaction, 'ops'>, opsSince: Array<Pick<OpLogEntry, 'ops'>>, options?: TransformOptions): DocOp[] {
  return rebaseDocOps(tx.ops, opsSince.map(entry => entry.ops), options)
}

/** Node an op addresses (its target, or the source of a split/merge). */
function addressedNode(op: DocOp): string {
  return op.t === 'insertNode' ? op.node.id : op.node
}

/**
 * Applies the rebased ops on the current rows, running `filterOp` before
 * each op. Returns the changed rows stamped with `version`, or a reason.
 */
function applyRebased(nodes: DocNodeRecord[], tx: DocTransaction, ops: DocOp[], version: number, options: SequenceOptions): DocNodeRecord[] | CollabRejectReason {
  const state = createDocState(tx.docId, nodes, version - 1)
  const touched = new Set<string>()
  try {
    for (const op of ops) {
      const reason = options.filterOp?.({
        docId: tx.docId,
        userId: options.userId,
        role: options.role,
        clientId: tx.clientId,
        op,
        node: state.nodes.get(addressedNode(op)),
        state,
      })
      if (reason) {
        return reason
      }
      for (const id of applyDocOps(state, [op], { version })) {
        touched.add(id)
      }
    }
  }
  catch (error) {
    if (error instanceof OtValidationError) {
      return error.reason
    }
    throw error
  }
  return [...touched].map(id => state.nodes.get(id)!)
}

/**
 * Sequences one transaction against an `OpLogStore`, with no in-memory
 * state: deduplicates by `(clientId, seq)`, rebases over the entries since
 * `tx.baseVersion`, checks permissions per op, applies the ops to the node
 * rows and appends with compare-and-set (retrying when another writer won).
 *
 * The caller acks the sender and broadcasts `entry` on `ok`, re-acks on
 * `duplicate`, and sends `collab:reject` otherwise.
 */
export async function sequenceTransaction(store: OpLogStore, tx: DocTransaction, options: SequenceOptions = {}): Promise<SequenceResult> {
  const maxAttempts = options.maxAttempts ?? 5
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const duplicate = await store.findSubmission(tx.docId, tx.clientId, tx.seq)
    if (duplicate) {
      return { status: 'duplicate', entry: duplicate }
    }
    const head = await store.head(tx.docId)
    if (tx.baseVersion > head) {
      return { status: 'rejected', reason: 'invalid' }
    }
    if (tx.baseVersion < await store.floor(tx.docId)) {
      return { status: 'rejected', reason: 'history-truncated', resync: true }
    }
    let ops: DocOp[]
    try {
      ops = rebaseTransaction(tx, await store.range(tx.docId, tx.baseVersion, head), options.transform)
    }
    catch (error) {
      if (error instanceof OtTransformConflict) {
        return { status: 'rejected', reason: 'conflict' }
      }
      throw error
    }
    const version = head + 1
    const before = await store.loadNodes(tx.docId)
    const nodes = applyRebased(before, tx, ops, version, options)
    if (typeof nodes === 'string') {
      return { status: 'rejected', reason: nodes }
    }
    const entry: OpLogEntry = { version, clientId: tx.clientId, seq: tx.seq, ops }
    if (options.userId !== undefined) {
      entry.userId = options.userId
    }
    let appended: boolean
    try {
      appended = await store.append(tx.docId, entry, nodes, options.appendContext)
    }
    catch (error) {
      if (error instanceof OpLogAppendRejected) {
        return { status: 'rejected', reason: error.reason }
      }
      throw error
    }
    if (appended) {
      const compactEvery = options.compactEvery ?? 1000
      if (store.compact && compactEvery > 0 && version % compactEvery === 0) {
        await store.compact(tx.docId)
      }
      return { status: 'ok', entry, nodes, before }
    }
  }
  throw new Error(`[rstore ot] could not append to ${tx.docId} after ${maxAttempts} attempts (contention)`)
}
