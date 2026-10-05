import type { CollabRejectReason, CollabWireClientMessage } from '../protocol/collab.js'
import type { DocNodeRecord, DocOp, DocTransaction, TransformOptions } from './types.js'

/** ot.js states: nothing pending, one transaction in flight, or in flight plus a buffer. */
export type CollabClientStatus = 'synchronized' | 'awaiting' | 'awaiting-with-buffer'

/** Pending local work, persisted to survive a reload while offline. */
export interface CollabPendingState {
  /** Last client sequence number used. */
  seq: number
  /** Server state the pending ops apply to (the merge base after a history truncation). */
  confirmed: { version: number, nodes: DocNodeRecord[] }
  inflight: DocTransaction | null
  buffer: DocOp[] | null
}

/** A node whose offline edits could not be merged automatically. */
export interface CollabConflict {
  /** Original node, as the server has it now. */
  nodeId: string
  /** Node holding the local version, inserted after the original (`attrs.conflictOf`). */
  copyId: string
}

/** Events of a collab client. */
export interface CollabClientEvents extends Record<string, unknown> {
  /**
   * The local state changed. `ops` were applied to it (`[]` for `reset`,
   * where the view must re-read the whole state).
   */
  change: {
    ops: DocOp[]
    origin: 'local' | 'remote' | 'rollback' | 'reset'
    /** Inverse of local ops, for undo. */
    inverse?: DocOp[]
    clientId?: string
    userId?: string
    /** For `reset`: remote ops (server form) folded into the rebuilt state. */
    remote?: DocOp[]
  }
  /** Local ops were refused by the server (or dropped after a conflict) and rolled back. */
  rejected: { reason: CollabRejectReason, ops: DocOp[] }
  /** Offline edits were saved as a conflict copy. */
  conflict: CollabConflict
  /** State machine status after an ack or a reject. */
  status: CollabClientStatus
  /**
   * The confirmed state (the server's, at `version`) changed: `nodes` lists
   * the changed node ids, `null` after a snapshot (every node). Emitted
   * before the matching `change` event.
   */
  confirmed: { version: number, nodes: string[] | null }
}

/** Options of `createCollabClient`. */
export interface CollabClientOptions {
  docId: string
  /** Stable per tab/device across reconnects (persist it with pending state). */
  clientId: string
  /** Sends a frame to the sequencer. Called only while connected. */
  send: (frame: CollabWireClientMessage) => void
  /**
   * Channel number of the document on its connection (protocol 2), unique
   * per connection. @default a number unique in this JS realm
   */
  channel?: number
  /** Must match the server's transform options. */
  transform?: TransformOptions
  /** Document already loaded (cache rows); otherwise the first hello asks for a snapshot. */
  initial?: { version: number, nodes: DocNodeRecord[] }
  /** Pending state restored from storage (see `pending`). */
  restore?: CollabPendingState
}
