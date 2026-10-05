import type { DocNodeRecord, DocOp, DocTransaction } from '../ot/types.js'
import type { CollabWireClientMessage } from '../protocol/collab.js'
import type { CollabCommittedEntry, CollabCommittedEntryResult } from './collabIngress.js'
import type { CollabSubscription } from './collabSubscriptions.js'
import type { CollabAccess, CollabPeer, CollabServerHooks, CollabServerOptions, ServerSubmitOptions } from './collabTypes.js'
import type { OpLogEntry } from './oplog.js'
import type { SequenceResult } from './sequence.js'
import { createCollabDelivery } from './collabDelivery.js'
import { createHelloHandler } from './collabHello.js'
import { createCommittedEntryIngress } from './collabIngress.js'
import { createSubscriptionRegistry } from './collabSubscriptions.js'
import { createRedactor, referencedIds } from './redact.js'
import { sequenceTransaction } from './sequence.js'

export type { CollabCommittedEntry, CollabCommittedEntryResult } from './collabIngress.js'
export type * from './collabTypes.js'

/** Options of the internal `submit`. */
interface SubmitOptions {
  /** Send no ack or reject to the sender (the caller answers with a snapshot). */
  quiet?: boolean
}

/**
 * Document sequencer for any transport: one instance per process, keeping
 * only subscriptions in memory (ordering and data live in the `OpLogStore`).
 * Transactions of a document are sequenced one at a time per instance; use
 * a single writer per document across instances (lease, sticky routing or a
 * Durable Object), the store's compare-and-set catching mistakes.
 */
export function createCollabServer<TPeer extends CollabPeer = CollabPeer>(options: CollabServerOptions<TPeer>) {
  const { store } = options
  // Hooks only ever receive the peers given to `handleMessage`, which are `TPeer`s.
  const hooks = (options.hooks ?? {}) as CollabServerHooks
  const subscriptions = createSubscriptionRegistry()
  const queues = new Map<string, Promise<unknown>>()
  let serverSeq = 0
  const serverClientId = `server:${Math.random().toString(36).slice(2, 10)}`

  /** Runs `task` after the previous task of the same document. */
  function serialize<T>(docId: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(docId) ?? Promise.resolve()
    const next = previous.then(task, task)
    const tail = next.catch(() => {})
    queues.set(docId, tail)
    // Forget idle documents, so the map does not grow with every document ever opened.
    tail.then(() => queues.get(docId) === tail && queues.delete(docId))
    return next
  }

  /** Rebinds a subscription to the peer object answering the current frame. */
  function replyTo(subscription: CollabSubscription, peer: CollabPeer): CollabSubscription {
    subscription.peer = peer
    return subscription
  }

  // `submit` is a hoisted function declaration: the hello handler resubmits pending transactions with it.
  const delivery = createCollabDelivery({ hooks, subscriptions })
  const hello = createHelloHandler({ store, hooks, subscriptions, delivery, submit })
  const committed = createCommittedEntryIngress({
    store,
    hooks,
    delivery,
    maxReplay: options.maxIngressReplay ?? 1000,
    sendSnapshot: hello.sendSnapshot,
  })

  /** Sends an entry to every subscriber but its author, redacted per peer. */
  async function broadcast(docId: string, entry: OpLogEntry, nodes: DocNodeRecord[], before: DocNodeRecord[], authorPeerId?: string): Promise<void> {
    for (const subscription of subscriptions.ofDoc(docId)) {
      if (subscription.peer.id === authorPeerId) {
        continue
      }
      if (subscription.version < entry.version - 1) {
        if (!(await committed.replay(subscription, entry.version - 1))) {
          continue
        }
      }
      if (subscription.version >= entry.version) {
        continue
      }
      const redacted = createRedactor(hooks.redact, subscription, nodes).ops(entry.ops, before)
      if (!redacted) {
        await hello.sendSnapshot(subscription)
        continue
      }
      if (redacted.rewritten.length) {
        subscription.rewrites.push({ version: entry.version, ids: redacted.rewritten })
      }
      if (await delivery.send(subscription, { type: 'collab:ops', docId, version: entry.version, clientId: entry.clientId, ...(entry.userId ? { userId: entry.userId } : {}), ops: redacted.ops })) {
        subscription.version = entry.version
      }
    }
  }

  /**
   * Records to correct on the sender after its transaction: when ops it
   * received rewritten were concurrent with it, its own transform of the
   * transaction may differ from the server's (its edit may have landed in a
   * hidden node, or in another node a concurrent split created). Returns
   * the peer's view of every node the transaction or a concurrent entry
   * touched.
   */
  async function corrections(subscription: CollabSubscription, tx: DocTransaction, result: Extract<SequenceResult, { status: 'ok' }>): Promise<DocNodeRecord[] | undefined> {
    const concurrent = subscription.rewrites.filter(rewrite => rewrite.version > tx.baseVersion)
    // In place: `subscription` may be a `replyTo` copy sharing the array. Later
    // submissions of the peer are based at least on this one's base version.
    subscription.rewrites.splice(0, subscription.rewrites.length, ...concurrent)
    if (!concurrent.length) {
      return undefined
    }
    const since = await store.range(tx.docId, tx.baseVersion, result.entry.version - 1)
    const ops = [...tx.ops, ...result.entry.ops, ...since.flatMap(entry => entry.ops)]
    const ids = new Set([...concurrent.flatMap(rewrite => rewrite.ids), ...ops.flatMap(referencedIds)])
    const after = new Map(result.before.map(node => [node.id, node]))
    for (const node of result.nodes) {
      after.set(node.id, node)
    }
    const known = [...ids].flatMap(id => after.get(id) ?? [])
    return createRedactor(hooks.redact, subscription, known).nodes()
  }

  /** Sequences a transaction, then acks/broadcasts/rejects (`subscription` is the sender, if any). */
  async function submit(tx: DocTransaction, subscription: CollabSubscription | undefined, access: CollabAccess, submitOptions: SubmitOptions = {}): Promise<SequenceResult> {
    const peer = subscription?.peer
    const result = await sequenceTransaction(store, tx, {
      userId: access.userId,
      role: access.role,
      transform: options.transform,
      compactEvery: options.compactEvery,
      appendContext: access.appendContext,
      filterOp: hooks.filterOp && (context => hooks.filterOp!({ ...context, peer })),
    })
    if (result.status === 'ok') {
      await broadcast(tx.docId, result.entry, result.nodes, result.before, peer?.id)
    }
    if (!subscription || submitOptions.quiet) {
      return result
    }
    if (result.status === 'rejected') {
      if (await delivery.send(subscription, { type: 'collab:reject', docId: tx.docId, seq: tx.seq, reason: result.reason, ...(result.resync ? { resync: true } : {}) }) && result.resync) {
        await hello.sendSnapshot(subscription)
      }
      return result
    }
    const nodes = result.status === 'ok' && hooks.redact ? await corrections(subscription, tx, result) : undefined
    if (await delivery.send(subscription, { type: 'collab:ack', docId: tx.docId, seq: tx.seq, version: result.entry.version, ...(nodes ? { nodes } : {}) })) {
      subscription.version = result.entry.version
    }
    return result
  }

  return {
    /** Handles a parsed client frame (validate raw payloads with `parseCollabMessage` first). */
    async handleMessage(peer: TPeer, frame: CollabWireClientMessage): Promise<void> {
      if (frame.type === 'collab:hello') {
        return serialize(frame.docId, () => hello.handle(peer, frame))
      }
      if (!('tx' in frame)) {
        // Protocol 2: the channel names the document and the client.
        const subscription = subscriptions.channel(peer.id, frame.ch)
        if (!subscription) {
          peer.send({ type: 'collab:reject', ch: frame.ch, seq: frame.seq, reason: 'unauthorized' })
          return
        }
        const tx: DocTransaction = { docId: subscription.docId, clientId: subscription.clientId, seq: frame.seq, baseVersion: frame.baseVersion, ops: frame.ops }
        return serialize(tx.docId, () => submit(tx, replyTo(subscription, peer), subscription.access).then(() => {}))
      }
      const { tx } = frame
      return serialize(tx.docId, async () => {
        const subscription = subscriptions.get(tx.docId, peer.id)
        if (!subscription || tx.clientId !== subscription.clientId) {
          peer.send({ type: 'collab:reject', docId: tx.docId, seq: tx.seq, reason: 'unauthorized' })
          return
        }
        await submit(tx, replyTo(subscription, peer), subscription.access)
      })
    },

    /** Forgets a closed connection. */
    handleClose(peerId: string): void {
      subscriptions.removePeer(peerId)
    },

    /**
     * Delivers one durable post-commit entry from another server process.
     * Its identity is checked against `OpLogStore`; duplicate or out-of-order
     * notifications replay only the missing bounded range, then use snapshots.
     */
    async ingestCommitted(payload: CollabCommittedEntry): Promise<CollabCommittedEntryResult> {
      return serialize(payload.docId, async () => {
        const accepted = await committed.validate(payload)
        if ('status' in accepted) {
          return accepted
        }
        const head = await store.head(payload.docId)
        let delivered = false
        for (const subscription of subscriptions.ofDoc(payload.docId)) {
          delivered = (await committed.replay(subscription, head)) || delivered
        }
        return { status: delivered ? 'delivered' : 'duplicate', version: accepted.version }
      })
    },

    /**
     * Sequences ops authored on the server (agents, patchers, migrations),
     * transformed like a client transaction and broadcast to every peer.
     * Pass a stable `clientId` and `seq` to make retries idempotent.
     */
    async submitServer(docId: string, ops: DocOp[], submitOptions: ServerSubmitOptions = {}): Promise<{ version: number, ops: DocOp[] }> {
      return serialize(docId, async () => {
        const tx: DocTransaction = {
          docId,
          clientId: submitOptions.clientId ?? serverClientId,
          seq: submitOptions.seq ?? ++serverSeq,
          baseVersion: submitOptions.baseVersion ?? await store.head(docId),
          ops,
        }
        const result = await submit(tx, undefined, { userId: submitOptions.userId, appendContext: submitOptions.appendContext })
        if (result.status === 'rejected') {
          throw new Error(`[rstore ot] server transaction rejected: ${result.reason}`)
        }
        return { version: result.entry.version, ops: result.entry.ops }
      })
    },
  }
}

/** A collab sequencer instance. */
export type CollabServer<TPeer extends CollabPeer = CollabPeer> = ReturnType<typeof createCollabServer<TPeer>>
