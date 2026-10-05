import type { DocNodeRecord, TransformOptions } from '../ot/types.js'
import type { CollabRejectReason, CollabWireServerMessage } from '../protocol/collab.js'
import type { OpLogStore } from './oplog.js'
import type { CollabFilterOpContext } from './sequence.js'

/** A connection to one client, provided by the transport adapter. */
export interface CollabPeer {
  /** Connection id, unique per server. */
  id: string
  /** Authenticated user, if the adapter knows it. */
  userId?: string
  /** Sends a frame (protocol 1 or 2, depending on what the peer negotiated). */
  send: (frame: CollabWireServerMessage) => void
}

/** Result of `authorize`: who the peer is for this document. */
export interface CollabAccess {
  userId?: string
  role?: string
  /** Private authenticated context forwarded to each durable append. */
  appendContext?: unknown
}

/**
 * Permission and visibility hooks of the sequencer. `TPeer` is the peer type
 * the transport adapter passes to `handleMessage` (for example with the
 * upgrade request, to authenticate).
 */
export interface CollabServerHooks<TPeer extends CollabPeer = CollabPeer> {
  /** First frame per (peer, document). Return `false` to refuse the document. */
  authorize?: (context: { peer: TPeer, docId: string }) => CollabAccess | false | Promise<CollabAccess | false>
  /** Rechecks one subscribed receiver before every document frame. False or an error suppresses that frame. */
  canDeliver?: (context: { peer: TPeer, docId: string }) => boolean | Promise<boolean>
  /** Per transformed op, before apply. Return a reject reason to refuse the transaction. */
  filterOp?: (context: CollabFilterOpContext & { peer?: TPeer }) => CollabRejectReason | undefined | void
  /**
   * Per node sent to a peer (snapshots and ops). Return `null` to hide the
   * node, or a reduced copy (masked attributes or content).
   *
   * - Ops that only touch hidden nodes reach the peer as version-only frames.
   * - Ops that mix hidden and visible nodes (a split into a hidden node, a
   *   merge of a hidden node into a visible one) or touch reduced nodes are
   *   sent as the changes of the peer's view of each node.
   * - When the server moved a peer's own concurrent edit into a hidden node,
   *   its ack carries the corrected records.
   *
   * Decide on stable properties (id, type, creator) and hide whole subtrees:
   * a node whose visibility changes reaches the peer as a deletion or an
   * insertion, which a peer that already knew it cannot apply (it reloads).
   */
  redact?: (context: { peer: TPeer, role?: string, node: DocNodeRecord }) => DocNodeRecord | null
}

/** Options of `createCollabServer`. */
export interface CollabServerOptions<TPeer extends CollabPeer = CollabPeer> {
  store: OpLogStore
  hooks?: CollabServerHooks<TPeer>
  /** Must match the clients' transform options. */
  transform?: TransformOptions
  /** Compacts the op log every this many versions (`store.compact`). `0` disables it. @default 1000 */
  compactEvery?: number
  /** Maximum missing entries replayed after an external commit before a snapshot. @default 1000 */
  maxIngressReplay?: number
}

/** Options of `submitServer`. */
export interface ServerSubmitOptions {
  /** Version the ops were authored against. @default the head */
  baseVersion?: number
  /** Stable id of the server-side author; with `seq`, makes retries idempotent. */
  clientId?: string
  seq?: number
  userId?: string
  /** Private context for a server-authored append. Never sent on the wire. */
  appendContext?: unknown
}
