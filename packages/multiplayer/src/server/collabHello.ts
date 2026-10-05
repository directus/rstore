import type { DocTransaction } from '../ot/types.js'
import type { CollabHelloMessage } from '../protocol/collab.js'
import type { createCollabDelivery } from './collabDelivery.js'
import type { CollabSubscription, createSubscriptionRegistry } from './collabSubscriptions.js'
import type { CollabAccess, CollabPeer, CollabServerHooks } from './collabTypes.js'
import type { OpLogEntry, OpLogStore } from './oplog.js'
import type { SequenceResult } from './sequence.js'
import { negotiateCollabProtocol } from '../protocol/version.js'
import { sendTo } from './collabSubscriptions.js'
import { createRedactor } from './redact.js'

/** What the hello handler needs from the server. */
interface HelloContext {
  store: OpLogStore
  hooks: CollabServerHooks
  subscriptions: ReturnType<typeof createSubscriptionRegistry>
  delivery: ReturnType<typeof createCollabDelivery>
  submit: (tx: DocTransaction, subscription: CollabSubscription, access: CollabAccess, options?: { quiet?: boolean }) => Promise<SequenceResult>
}

/**
 * `collab:hello` handling: protocol negotiation, `authorize`, subscription,
 * then a snapshot or a catch-up from the client's `baseVersion`, and the
 * resubmission of its pending transactions.
 */
export function createHelloHandler(context: HelloContext) {
  const { store, hooks, subscriptions, delivery } = context

  /** Sends the redacted document; `acked` tells the client its in-flight transaction is included. */
  async function sendSnapshot(subscription: CollabSubscription, acked?: number): Promise<boolean> {
    const { docId } = subscription
    const version = await store.head(docId)
    const nodes = await store.loadNodes(docId)
    const redactor = createRedactor(hooks.redact, subscription, nodes)
    if (!(await delivery.send(subscription, { type: 'collab:snapshot', docId, version, nodes: redactor.nodes(), ...(acked !== undefined ? { acked } : {}) }))) {
      return false
    }
    subscription.version = version
    return true
  }

  /**
   * Whether entries cannot be replayed to a peer with redaction: an op needs
   * rewriting (only possible right after sequencing, when the document
   * before the entry is known), or the peer's own entry may need corrections
   * because it received rewritten ops that are not acknowledged yet.
   */
  function needsReload(subscription: CollabSubscription, entries: OpLogEntry[], nodes: Parameters<typeof createRedactor>[2]): boolean {
    if (!hooks.redact) {
      return false
    }
    const redactor = createRedactor(hooks.redact, subscription, nodes)
    const correctable = subscription.rewrites.length > 0
    return entries.some(entry => (correctable && entry.clientId === subscription.clientId) || redactor.ops(entry.ops) === null)
  }

  /** Sequences the pending transactions, then sends a snapshot that includes them. */
  async function reload(subscription: CollabSubscription, pending: DocTransaction[]) {
    let acked: number | undefined
    for (const tx of pending) {
      const result = await context.submit(tx, subscription, subscription.access, { quiet: true })
      if (result.status !== 'rejected') {
        acked = tx.seq
      }
    }
    await sendSnapshot(subscription, acked)
  }

  /** Opens or resumes a document for a peer. */
  async function handle(peer: CollabPeer, frame: CollabHelloMessage) {
    const { docId } = frame
    const protocol = negotiateCollabProtocol(frame.protocols)
    if (protocol === null) {
      peer.send({ type: 'collab:reject', docId, reason: 'protocol' })
      return
    }
    const access = hooks.authorize ? await hooks.authorize({ peer, docId }) : { userId: peer.userId }
    if (access === false) {
      peer.send({ type: 'collab:reject', docId, reason: 'unauthorized' })
      return
    }
    const subscription: CollabSubscription = { peer, docId, access, clientId: frame.clientId, protocol, ch: frame.ch, authors: new Map(), version: frame.baseVersion ?? 0, rewrites: subscriptions.rewritesOf(docId, frame.clientId) }
    subscriptions.add(subscription)
    const head = await store.head(docId)
    sendTo(subscription, { type: 'collab:welcome', docId, protocol, version: head })
    const pending = (frame.pending ?? []).filter(tx => tx.docId === docId && tx.clientId === frame.clientId)
    if (frame.baseVersion === undefined || frame.baseVersion > head) {
      await reload(subscription, pending)
      return
    }
    if (frame.baseVersion < await store.floor(docId)) {
      // Too old to catch up: the client falls back to a snapshot merge.
      const seq = pending[0]?.seq
      if (await delivery.send(subscription, { type: 'collab:reject', docId, ...(seq !== undefined ? { seq } : {}), reason: 'history-truncated', resync: true })) {
        await sendSnapshot(subscription)
      }
      return
    }
    const nodes = await store.loadNodes(docId)
    const entries = await store.range(docId, frame.baseVersion, head)
    if (needsReload(subscription, entries, nodes)) {
      await reload(subscription, pending)
      return
    }
    // Catch-up: the peer's own sequenced transactions come back as acks.
    const redactor = createRedactor(hooks.redact, subscription, nodes)
    for (const entry of entries) {
      if (entry.clientId === frame.clientId) {
        if (!(await delivery.send(subscription, { type: 'collab:ack', docId, seq: entry.seq, version: entry.version }))) {
          return
        }
      }
      else {
        if (!(await delivery.send(subscription, { type: 'collab:ops', docId, version: entry.version, clientId: entry.clientId, ...(entry.userId ? { userId: entry.userId } : {}), ops: redactor.ops(entry.ops)!.ops }))) {
          return
        }
      }
    }
    subscription.version = head
    for (const tx of pending) {
      if (!(await store.findSubmission(docId, tx.clientId, tx.seq))) {
        await context.submit(tx, subscription, subscription.access)
      }
    }
  }

  return { handle, sendSnapshot }
}
