import type { CollabClientMessage, CollabServerMessage, CollabWireServerMessage } from '../protocol/collab.js'
import type { CollabClientEvents, CollabClientOptions, CollabClientStatus } from './clientTypes.js'
import type { createEmitter } from './emitter.js'
import type { DocOp, DocState, DocTransaction } from './types.js'
import { attempt } from './attempt.js'
import { createClientWire } from './clientWire.js'
import { applyDocOps, applyDocOpsLeniently, tryApplyDocOps } from './doc/apply.js'
import { composeDocOps, docOpTouches } from './doc/compose.js'
import { invertDocOps } from './doc/invert.js'
import { cloneDocState, createDocState, stampNodeVersions } from './doc/state.js'
import { rebaseDroppingConflicts, transformDocOps } from './doc/transform.js'
import { pruneUnconfirmedNodes, rebaseOnSnapshot } from './pending.js'

type ServerFrame<T extends CollabServerMessage['type']> = Extract<CollabServerMessage, { type: T }>

/**
 * State machine of `createCollabClient` (ot.js): at most one transaction in
 * flight, later edits composed into one buffer, remote ops transformed
 * against both. `confirmed` mirrors the server at the last version received;
 * `local` is what the user sees (`confirmed` + pending ops).
 *
 * Validity that depends on state (a move creating a cycle once another move
 * lands) is decided by the server when it sequences: until then `local`
 * shows the pending ops that still apply (`dirty`) and is rebuilt once the
 * server answered.
 */
export function createClientCore(options: CollabClientOptions, emitter: ReturnType<typeof createEmitter<CollabClientEvents>>) {
  const { docId, clientId } = options
  const wire = createClientWire(docId, options.channel)
  const core = {
    confirmed: null as DocState | null,
    local: createDocState(docId, [], 0),
    inflight: (options.restore?.inflight ?? null) as DocTransaction | null,
    buffer: (options.restore?.buffer ?? null) as DocOp[] | null,
    seq: options.restore?.seq ?? 0,
    /** The in-flight transaction conflicts with a remote op: the server rejects it the same way. */
    doomed: false,
    /** `local` skipped pending ops that did not apply. */
    dirty: false,
    connected: false,
    status,
    send,
    flush,
    receive,
    hello,
  }

  function status(): CollabClientStatus {
    return core.inflight ? (core.buffer ? 'awaiting-with-buffer' : 'awaiting') : 'synchronized'
  }

  function send(frame: CollabClientMessage) {
    if (core.connected) {
      options.send(wire.encode(frame))
    }
  }

  /** Turns the buffer into the next in-flight transaction (sent unless `sendNow` is false). */
  function flush(sendNow = true) {
    if (core.inflight || !core.buffer || !core.confirmed) {
      return
    }
    submitInflight(core.buffer, sendNow)
    core.buffer = null
  }

  /** Makes `ops` the in-flight transaction. */
  function submitInflight(ops: DocOp[], sendNow = true) {
    core.inflight = { docId, clientId, seq: ++core.seq, baseVersion: core.confirmed!.version, ops }
    if (sendNow) {
      // A copy: `inflight.ops` is rebased in place while the frame may still be queued.
      send({ type: 'collab:submit', tx: { ...core.inflight } })
    }
  }

  /** `local = confirmed + inflight + buffer`, skipping pending ops that do not apply. */
  function rebuildLocal(remote?: DocOp[]) {
    core.local = cloneDocState(core.confirmed!)
    const pending = [...(core.inflight && !core.doomed ? core.inflight.ops : []), ...(core.buffer ?? [])]
    core.dirty = !applyDocOpsLeniently(core.local, pending)
    emitter.emit('change', { ops: [], origin: 'reset', ...(remote ? { remote } : {}) })
  }

  /** A remote transaction, already transformed by the server to its version. */
  function receiveOps(frame: ServerFrame<'collab:ops'>, confirmed: DocState) {
    if (frame.version !== confirmed.version + 1) {
      resync()
      return
    }
    const touched = attempt(() => applyDocOps(confirmed, frame.ops, { version: frame.version }))
    if (!touched) {
      // Only a change of visibility under redaction gets here: reload.
      resync()
      return
    }
    emitter.emit('confirmed', { version: frame.version, nodes: [...touched] })
    let remote = frame.ops
    if (core.inflight && !core.doomed) {
      const result = attempt(() => transformDocOps(remote, core.inflight!.ops, options.transform))
      if (result) {
        core.inflight.ops = result.later
        remote = result.first
      }
      else {
        // The server rebases the in-flight transaction with the same
        // transforms in the same order, hits the same conflict and rejects
        // it: drop it from the view now. The buffer was built on it; it is
        // rebased below as if it were not (approximate, but convergent).
        core.doomed = true
      }
    }
    let dropped = false
    if (core.buffer) {
      // Never sent: only the ops that conflict are dropped.
      const result = rebaseDroppingConflicts(remote, core.buffer, options.transform)
      if (result.dropped.length) {
        emitter.emit('rejected', { reason: 'conflict', ops: result.dropped })
        dropped = true
      }
      core.buffer = result.pending.length ? result.pending : null
      remote = result.sequenced
    }
    if (core.doomed || core.dirty || dropped || !tryApplyDocOps(core.local, remote)) {
      rebuildLocal(frame.ops)
    }
    else {
      emitter.emit('change', { ops: remote, origin: 'remote', clientId: frame.clientId, userId: frame.userId })
    }
    stampNodeVersions(core.local, touched, frame.version)
  }

  /** Our in-flight transaction was sequenced. */
  function receiveAck(frame: ServerFrame<'collab:ack'>, inflight: DocTransaction, confirmed: DocState) {
    if (core.doomed || frame.version !== confirmed.version + 1) {
      // Cannot happen with deterministic transforms: start over from a snapshot.
      resync()
      return
    }
    const touched = attempt(() => applyDocOps(confirmed, inflight.ops, { version: frame.version }))
    if (!touched) {
      resync()
      return
    }
    stampNodeVersions(core.local, touched, frame.version)
    if (frame.nodes) {
      // Redaction made the server transform our transaction differently:
      // take its records, and drop buffered edits made on our version of them.
      for (const node of frame.nodes) {
        confirmed.nodes.set(node.id, node)
        touched.add(node.id)
      }
      const dropped = core.buffer?.filter(op => frame.nodes!.some(node => docOpTouches(op, node.id))) ?? []
      if (dropped.length) {
        core.buffer = core.buffer!.filter(op => !dropped.includes(op))
        core.buffer = core.buffer.length ? core.buffer : null
        emitter.emit('rejected', { reason: 'conflict', ops: dropped })
      }
    }
    core.inflight = null
    emitter.emit('confirmed', { version: frame.version, nodes: [...touched] })
    if (core.dirty || frame.nodes) {
      rebuildLocal()
    }
    flush()
    emitter.emit('status', status())
  }

  /** The in-flight transaction was refused: roll it back, keep later edits. */
  function receiveReject(frame: ServerFrame<'collab:reject'>, rejected: DocTransaction) {
    core.inflight = null
    if (!core.doomed && rejected.ops.length > 1) {
      // Bisect: resubmit each half, so only the ops the server refuses are
      // rolled back (a long offline session is one composed transaction).
      const half = Math.ceil(rejected.ops.length / 2)
      core.buffer = composeDocOps(rejected.ops.slice(half), core.buffer ?? [])
      submitInflight(rejected.ops.slice(0, half))
      return
    }
    if (core.doomed || core.dirty || !rollback(rejected.ops)) {
      core.doomed = false
      rebuildLocal()
    }
    emitter.emit('rejected', { reason: frame.reason, ops: rejected.ops })
    flush()
    emitter.emit('status', status())
  }

  /** Removes rejected ops from the view: their inverse, transformed over the buffer. */
  function rollback(ops: DocOp[]): boolean {
    const inverse = attempt(() => invertDocOps(core.confirmed!, ops))
    const result = inverse && attempt(() => transformDocOps(inverse, core.buffer ?? [], options.transform))
    if (!result || !tryApplyDocOps(core.local, result.first)) {
      return false
    }
    core.buffer = core.buffer && result.later.length ? result.later : null
    pruneUnconfirmedNodes(core.local, core.confirmed!, core.buffer ?? [])
    emitter.emit('change', { ops: result.first, origin: 'rollback' })
    return true
  }

  /** Server snapshot: first load, or a resync after history truncation. */
  function receiveSnapshot(frame: ServerFrame<'collab:snapshot'>) {
    const snapshot = createDocState(docId, frame.nodes, frame.version)
    // The snapshot may include the in-flight transaction: it is then part of the merge base.
    const included = core.inflight && !core.doomed && frame.acked === core.inflight.seq ? core.inflight : null
    const pending = [...(core.inflight && !core.doomed && !included ? core.inflight.ops : []), ...(core.buffer ?? [])]
    core.buffer = null
    if (core.confirmed && pending.length) {
      const base = included ? cloneDocState(core.confirmed) : core.confirmed
      if (included) {
        applyDocOpsLeniently(base, included.ops)
      }
      // Offline past the op log retention (or a reload under redaction):
      // merge per node, conflict copies on overlap.
      const fallback = rebaseOnSnapshot(base, core.local, snapshot, `conflict-${clientId}`, pending)
      for (const conflict of fallback.conflicts) {
        emitter.emit('conflict', conflict)
      }
      core.buffer = fallback.ops.length ? fallback.ops : null
    }
    core.inflight = null
    core.doomed = false
    core.confirmed = snapshot
    emitter.emit('confirmed', { version: frame.version, nodes: null })
    rebuildLocal()
    flush()
    emitter.emit('status', status())
  }

  /** Drops pending state and reloads the document from a snapshot. */
  function resync() {
    const dropped = [...(core.inflight?.ops ?? []), ...(core.buffer ?? [])]
    core.inflight = null
    core.buffer = null
    core.doomed = false
    core.confirmed = null
    if (dropped.length) {
      emitter.emit('rejected', { reason: 'conflict', ops: dropped })
    }
    wire.reset()
    send({ type: 'collab:hello', docId, clientId, protocols: wire.protocols, ch: wire.channel })
  }

  /** Handles a frame from the sequencer (`collab:welcome` only sets the protocol). */
  function receive(raw: CollabWireServerMessage) {
    const frame = wire.decode(raw)
    const { confirmed, inflight } = core
    if (!frame) {
      return
    }
    if (frame.type === 'collab:snapshot') {
      receiveSnapshot(frame)
    }
    else if (frame.type === 'collab:ops' && confirmed && frame.version > confirmed.version) {
      receiveOps(frame, confirmed)
    }
    else if (frame.type === 'collab:ack' && inflight && confirmed && frame.seq === inflight.seq) {
      receiveAck(frame, inflight, confirmed)
    }
    else if (frame.type === 'collab:reject' && !frame.resync && inflight && confirmed && frame.seq === inflight.seq) {
      receiveReject(frame, inflight)
    }
    else if (frame.type === 'collab:reject' && frame.seq === undefined && !frame.resync) {
      emitter.emit('rejected', { reason: frame.reason, ops: [] })
    }
  }

  /** Opens or resumes the document: catch-up from `confirmed` and resubmit of the in-flight transaction. */
  function hello() {
    core.connected = true
    if (core.doomed && core.inflight) {
      // Never resubmit a transaction known to conflict: its ops were not
      // rebased since. The server rejects it or never saw it.
      emitter.emit('rejected', { reason: 'conflict', ops: core.inflight.ops })
      core.inflight = null
      core.doomed = false
    }
    // The buffer travels with the hello as the pending transaction.
    flush(false)
    const { confirmed, inflight } = core
    wire.reset()
    send({
      type: 'collab:hello',
      docId,
      clientId,
      protocols: wire.protocols,
      ch: wire.channel,
      ...(confirmed ? { baseVersion: confirmed.version } : {}),
      ...(inflight && confirmed ? { pending: [{ ...inflight, baseVersion: confirmed.version }] } : {}),
    })
  }

  const initial = options.restore?.confirmed ?? options.initial
  if (initial) {
    core.confirmed = createDocState(docId, initial.nodes, initial.version)
    rebuildLocal()
  }
  return core
}
