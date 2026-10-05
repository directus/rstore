import type { DocTransaction } from '../ot/types.js'
import type { CollabRejectReason, CollabWireClientMessage, CollabWireServerMessage } from './collab.js'
import type { ParseMultiplayerMessageOptions } from './types.js'
import { isMultiplayerId } from './guards.js'
import { isRecord } from './record.js'

/** Op kinds a transaction may contain. */
const OP_TYPES = new Set(['text', 'insertNode', 'deleteNode', 'restoreNode', 'moveNode', 'setAttrs', 'setType', 'splitNode', 'mergeNode'])

/** Reject reasons on the wire. */
const REJECT_REASONS = new Set<CollabRejectReason>(['forbidden', 'unavailable', 'invalid', 'cycle', 'conflict', 'history-truncated', 'protocol', 'unauthorized'])

/** Maximum ops in one transaction frame. */
const MAX_OPS = 10_000

/** Returns whether a value is a version or sequence number. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Whether every op of a list has a known kind (contents are checked when applied). */
function isOpList(value: unknown): boolean {
  return Array.isArray(value) && value.length <= MAX_OPS && value.every(op => isRecord(op) && OP_TYPES.has(op.t as string))
}

/**
 * Shape check of a transaction: ids, counters and op kinds. Op contents are
 * validated by the sequencer when it applies them.
 */
export function isDocTransaction(value: unknown): value is DocTransaction {
  return isRecord(value)
    && isMultiplayerId(value.docId)
    && isMultiplayerId(value.clientId)
    && isCount(value.seq)
    && isCount(value.baseVersion)
    && isOpList(value.ops)
}

/** Returns whether a value is a valid frame sent by a collab client (protocol 1 or 2). */
export function isCollabClientMessage(value: unknown): value is CollabWireClientMessage {
  if (!isRecord(value)) {
    return false
  }
  switch (value.type) {
    case 'collab:hello':
      return isMultiplayerId(value.docId)
        && isMultiplayerId(value.clientId)
        && (value.protocols === undefined || (Array.isArray(value.protocols) && value.protocols.length <= 16 && value.protocols.every(isCount)))
        && (value.baseVersion === undefined || isCount(value.baseVersion))
        && (value.pending === undefined || (Array.isArray(value.pending) && value.pending.length <= 16 && value.pending.every(isDocTransaction)))
        && (value.ch === undefined || isCount(value.ch))
    case 'collab:submit':
      return value.ch === undefined
        ? isDocTransaction(value.tx)
        : isCount(value.ch) && isCount(value.seq) && isCount(value.baseVersion) && isOpList(value.ops)
    default:
      return false
  }
}

/** Whether a value is a list of node records (contents are trusted from the server). */
function isNodeList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isRecord)
}

/**
 * Returns whether a value is a valid frame sent by the sequencer: protocol 1
 * frames carry `docId`, protocol 2 frames after the welcome carry `ch`.
 */
export function isCollabServerMessage(value: unknown): value is CollabWireServerMessage {
  if (!isRecord(value)) {
    return false
  }
  const channel = value.docId === undefined
  if (channel ? !isCount(value.ch) || value.type === 'collab:welcome' : !isMultiplayerId(value.docId)) {
    return false
  }
  switch (value.type) {
    case 'collab:welcome':
      return isCount(value.protocol) && isCount(value.version)
    case 'collab:snapshot':
      return isCount(value.version) && isNodeList(value.nodes) && (value.acked === undefined || isCount(value.acked))
    case 'collab:ack':
      return isCount(value.seq) && isCount(value.version) && (value.nodes === undefined || isNodeList(value.nodes))
    case 'collab:ops':
      return isCount(value.version)
        && (channel ? isCount(value.author) : isMultiplayerId(value.clientId))
        && (value.clientId === undefined || isMultiplayerId(value.clientId))
        && (value.userId === undefined || isMultiplayerId(value.userId))
        && isOpList(value.ops)
    case 'collab:reject':
      return (value.seq === undefined || isCount(value.seq))
        && REJECT_REASONS.has(value.reason as CollabRejectReason)
        && (value.resync === undefined || typeof value.resync === 'boolean')
    default:
      return false
  }
}

/**
 * Parses a raw `collab:*` payload without throwing; `null` for non-JSON or
 * invalid frames (`options.onInvalid` receives parsed invalid frames).
 */
export function parseCollabMessage(raw: unknown, options: ParseMultiplayerMessageOptions = {}): CollabWireClientMessage | CollabWireServerMessage | null {
  if (typeof raw !== 'string') {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!isCollabClientMessage(parsed) && !isCollabServerMessage(parsed)) {
    options.onInvalid?.(parsed)
    return null
  }
  return parsed
}
