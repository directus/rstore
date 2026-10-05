import type { DocNodeRecord, DocOp, DocTransaction } from '../ot/types.js'

/** Why the sequencer refused a transaction or a connection. */
export type CollabRejectReason
  = | 'forbidden'
    | 'unavailable'
    | 'invalid'
    | 'cycle'
    | 'conflict'
    | 'history-truncated'
    | 'protocol'
    | 'unauthorized'

/** C→S: open (or resume) a document. Resuming sends `baseVersion` and the unacknowledged transaction. */
export interface CollabHelloMessage {
  type: 'collab:hello'
  docId: string
  clientId: string
  /** Protocol versions the client speaks. @default [1] */
  protocols?: number[]
  /** Last server version the client has; omit to get a snapshot. */
  baseVersion?: number
  /** Transactions sent before a disconnect and maybe not sequenced yet. */
  pending?: DocTransaction[]
  /**
   * Channel number of this document on the connection, chosen by the client
   * (unique per connection). With protocol 2, later frames of the document
   * carry it instead of `docId` and `clientId` (see {@link CollabChannelSubmitMessage}).
   */
  ch?: number
}

/** C→S: one transaction. */
export interface CollabSubmitMessage {
  type: 'collab:submit'
  tx: DocTransaction
}

/** S→C: hello accepted; catch-up frames up to `version` follow. */
export interface CollabWelcomeMessage {
  type: 'collab:welcome'
  docId: string
  protocol: number
  /** Server head when the hello was handled. */
  version: number
  /** Channel of the hello, echoed with protocol 2. */
  ch?: number
}

/** S→C: full document (redacted for the peer). */
export interface CollabSnapshotMessage {
  type: 'collab:snapshot'
  docId: string
  version: number
  nodes: DocNodeRecord[]
  /**
   * Sequence number of the client's in-flight transaction when the snapshot
   * already includes it (the server sequenced the hello's pending
   * transaction before reloading the client).
   */
  acked?: number
}

/** S→C: the sender's transaction was sequenced at `version`. */
export interface CollabAckMessage {
  type: 'collab:ack'
  docId: string
  seq: number
  version: number
  /**
   * Corrected records (redacted for the peer): sent when redaction made the
   * peer's own transform of its transaction differ from the server's, the
   * client replaces its confirmed records with them.
   */
  nodes?: DocNodeRecord[]
}

/**
 * S→C: another client's transaction, already transformed to the head.
 * `ops` is empty when every op touched nodes hidden from this peer: the
 * frame still advances the peer's version.
 */
export interface CollabOpsMessage {
  type: 'collab:ops'
  docId: string
  version: number
  clientId: string
  userId?: string
  ops: DocOp[]
}

/** S→C: a transaction (`seq`) or the hello was refused. */
export interface CollabRejectMessage {
  type: 'collab:reject'
  docId: string
  seq?: number
  reason: CollabRejectReason
  /** The client must rebuild from a snapshot (sent next). */
  resync?: boolean
}

/** Frames a client sends. */
export type CollabClientMessage = CollabHelloMessage | CollabSubmitMessage

/** Frames the sequencer sends. */
export type CollabServerMessage = CollabWelcomeMessage | CollabSnapshotMessage | CollabAckMessage | CollabOpsMessage | CollabRejectMessage

/**
 * C→S, protocol 2: a transaction on the channel opened by `collab:hello`.
 * The server knows the document and client ids from the hello, so the
 * frame does not repeat them (keystroke frames stay under 200 bytes).
 */
export interface CollabChannelSubmitMessage {
  type: 'collab:submit'
  ch: number
  seq: number
  baseVersion: number
  ops: DocOp[]
}

/** Server frames of protocol 2: `ch` replaces `docId`. */
type ChannelFrame<T extends { docId: string }> = Omit<T, 'docId'> & { ch: number }

/** S→C, protocol 2: {@link CollabAckMessage} on a channel. */
export type CollabChannelAckMessage = ChannelFrame<CollabAckMessage>

/** S→C, protocol 2: {@link CollabSnapshotMessage} on a channel. */
export type CollabChannelSnapshotMessage = ChannelFrame<CollabSnapshotMessage>

/** S→C, protocol 2: {@link CollabRejectMessage} on a channel. */
export type CollabChannelRejectMessage = ChannelFrame<CollabRejectMessage>

/**
 * S→C, protocol 2: {@link CollabOpsMessage} on a channel. The author is a
 * number scoped to the channel; its `clientId` (and `userId`) are only sent
 * with the first frame of that author.
 */
export interface CollabChannelOpsMessage {
  type: 'collab:ops'
  ch: number
  version: number
  author: number
  clientId?: string
  userId?: string
  ops: DocOp[]
}

/** Frames a protocol 2 server sends after the welcome. */
export type CollabChannelServerMessage = CollabChannelAckMessage | CollabChannelSnapshotMessage | CollabChannelRejectMessage | CollabChannelOpsMessage

/** Every frame a client may send (protocol 1 or 2). */
export type CollabWireClientMessage = CollabClientMessage | CollabChannelSubmitMessage

/** Every frame a server may send (protocol 1 or 2). */
export type CollabWireServerMessage = CollabServerMessage | CollabChannelServerMessage
