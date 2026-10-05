import type { DocNodeRecord } from '../ot/types.js'
import type { createCollabDelivery } from './collabDelivery.js'
import type { CollabSubscription } from './collabSubscriptions.js'
import type { CollabServerHooks } from './collabTypes.js'
import type { OpLogEntry, OpLogStore } from './oplog.js'
import { fieldValuesEqual } from '@rstore/shared'

/** Durable post-commit notification accepted by another collab server instance. */
export interface CollabCommittedEntry {
  /** Document containing the committed entry. */
  docId: string
  /** Entry written by the authoritative `OpLogStore`. */
  entry: OpLogEntry
  /** Rows changed by the entry, for transport payload validation. */
  nodes: DocNodeRecord[]
}

/** Outcome of receiving one durable post-commit notification. */
export type CollabCommittedEntryResult
  = | { status: 'delivered', version: number }
    | { status: 'duplicate', version: number }
    | { status: 'ignored', reason: 'invalid' | 'not-found' | 'mismatch' }

/** Dependencies owned by `createCollabServer` for committed-entry delivery. */
export interface CommittedEntryIngressContext {
  store: OpLogStore
  hooks: CollabServerHooks
  delivery: ReturnType<typeof createCollabDelivery>
  /** Maximum missing entries replayed to one peer before falling back to a snapshot. */
  maxReplay: number
  /** Sends the existing redacted snapshot protocol frame. */
  sendSnapshot: (subscription: CollabSubscription) => Promise<boolean>
}

/** One accepted notification after its durable identity was checked. */
interface AcceptedCommittedEntry {
  version: number
}

/** Whether `value` is a non-negative safe integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Whether a bus payload has the shallow shape needed before store validation. */
function isPayloadShapeValid(payload: CollabCommittedEntry): boolean {
  const { docId, entry, nodes } = payload
  return typeof docId === 'string'
    && docId.length > 0
    && !!entry
    && Number.isSafeInteger(entry.version)
    && entry.version > 0
    && typeof entry.clientId === 'string'
    && entry.clientId.length > 0
    && isNonNegativeInteger(entry.seq)
    && (entry.userId === undefined || typeof entry.userId === 'string')
    && Array.isArray(entry.ops)
    && Array.isArray(nodes)
    && nodes.every(node => !!node && node.docId === docId && typeof node.id === 'string' && node.id.length > 0)
}

/** Compare durable entry identity. Time is store metadata and may be absent from `onAppend`. */
function hasSameEntryIdentity(a: OpLogEntry, b: OpLogEntry): boolean {
  return a.version === b.version
    && a.clientId === b.clientId
    && a.seq === b.seq
    && a.userId === b.userId
    && fieldValuesEqual(a.ops, b.ops)
}

/** Creates bounded replay and validation for post-commit cross-process notifications. */
export function createCommittedEntryIngress(context: CommittedEntryIngressContext) {
  const { store, hooks, delivery, maxReplay, sendSnapshot } = context

  /** Catch one subscription up through `upTo`, falling back to its existing snapshot flow. */
  async function replay(subscription: CollabSubscription, upTo: number): Promise<boolean> {
    if (subscription.version >= upTo) {
      return false
    }
    const floor = await store.floor(subscription.docId)
    if (subscription.version < floor || upTo - subscription.version > maxReplay || hooks.redact) {
      return sendSnapshot(subscription)
    }
    const entries = await store.range(subscription.docId, subscription.version, upTo)
    if (entries.length !== upTo - subscription.version || entries.some((entry, index) => entry.version !== subscription.version + index + 1)) {
      return sendSnapshot(subscription)
    }
    let delivered = false
    for (const entry of entries) {
      if (entry.clientId === subscription.clientId) {
        if (!(await delivery.send(subscription, { type: 'collab:ack', docId: subscription.docId, seq: entry.seq, version: entry.version }))) {
          return delivered
        }
      }
      else {
        if (!(await delivery.send(subscription, { type: 'collab:ops', docId: subscription.docId, version: entry.version, clientId: entry.clientId, ...(entry.userId ? { userId: entry.userId } : {}), ops: entry.ops }))) {
          return delivered
        }
      }
      subscription.version = entry.version
      delivered = true
    }
    return delivered
  }

  /** Validates notification identity against the durable store before any peer receives it. */
  async function validate(payload: CollabCommittedEntry): Promise<AcceptedCommittedEntry | CollabCommittedEntryResult> {
    if (!isPayloadShapeValid(payload)) {
      return { status: 'ignored', reason: 'invalid' }
    }
    const { docId, entry } = payload
    const stored = await store.findSubmission(docId, entry.clientId, entry.seq)
    if (!stored) {
      return { status: 'ignored', reason: 'not-found' }
    }
    if (stored.version !== entry.version || stored.clientId !== entry.clientId || stored.seq !== entry.seq || stored.userId !== entry.userId) {
      return { status: 'ignored', reason: 'mismatch' }
    }
    const head = await store.head(docId)
    if (entry.version > head) {
      return { status: 'ignored', reason: 'not-found' }
    }
    if (entry.version > await store.floor(docId)) {
      const [canonical] = await store.range(docId, entry.version - 1, entry.version)
      if (!canonical || !hasSameEntryIdentity(canonical, entry)) {
        return { status: 'ignored', reason: 'mismatch' }
      }
    }
    return { version: entry.version }
  }

  return { replay, validate }
}
