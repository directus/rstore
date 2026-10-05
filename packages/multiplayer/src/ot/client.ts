import type { CollabWireServerMessage } from '../protocol/collab.js'
import type { CollabClientEvents, CollabClientOptions, CollabClientStatus, CollabPendingState } from './clientTypes.js'
import type { DocOp, DocState } from './types.js'
import { createClientCore } from './clientCore.js'
import { applyDocOps } from './doc/apply.js'
import { composeDocOps } from './doc/compose.js'
import { invertDocOps } from './doc/invert.js'
import { createEmitter } from './emitter.js'

export type * from './clientTypes.js'

/**
 * Creates the client of one document on the `collab:*` protocol: local
 * edits apply immediately and are sent one transaction at a time, remote
 * transactions are transformed over pending ones, rejected ones are rolled
 * back (bisected first, so only refused ops are lost).
 *
 * The transport is injected: pass `send`, feed frames to `receive`, call
 * `connect`/`disconnect` on open/close.
 */
export function createCollabClient(options: CollabClientOptions) {
  const emitter = createEmitter<CollabClientEvents>()
  const core = createClientCore(options, emitter)

  return {
    docId: options.docId,
    clientId: options.clientId,
    on: emitter.on,
    /** What the user sees: confirmed state plus pending local ops. */
    get state(): DocState {
      return core.local
    },
    /** The server's state at `confirmedVersion` (`null` before the first snapshot). Do not mutate. */
    get confirmed(): DocState | null {
      return core.confirmed
    },
    /** Whether a snapshot is loaded (edits are refused before). */
    get loaded(): boolean {
      return core.confirmed !== null
    },
    /** Last server version received (-1 before the first snapshot). */
    get confirmedVersion(): number {
      return core.confirmed?.version ?? -1
    },
    /** ot.js state: `synchronized`, `awaiting` (one in flight) or `awaiting-with-buffer`. */
    get status(): CollabClientStatus {
      return core.status()
    },
    /** Pending transactions and the confirmed nodes they apply to, for offline persistence. */
    get pending(): CollabPendingState | null {
      const { confirmed, inflight, buffer } = core
      if (!confirmed || (!inflight && !buffer)) {
        return null
      }
      return { seq: core.seq, confirmed: { version: confirmed.version, nodes: [...confirmed.nodes.values()] }, inflight: core.doomed ? null : inflight, buffer }
    },
    /**
     * Applies a local edit and queues it for the server. Throws
     * `OtValidationError` (state unchanged) when the ops do not apply.
     *
     * @returns The inverse ops, for undo.
     */
    submit(ops: DocOp[]): DocOp[] {
      if (!core.confirmed) {
        throw new Error('[rstore ot] the document is not loaded yet')
      }
      if (!ops.length) {
        return []
      }
      const inverse = invertDocOps(core.local, ops)
      applyDocOps(core.local, ops)
      core.buffer = composeDocOps(core.buffer ?? [], ops)
      core.flush()
      emitter.emit('change', { ops, origin: 'local', inverse })
      return inverse
    },
    /** Handles a frame from the sequencer (frames of other documents and channels are ignored). */
    receive(frame: CollabWireServerMessage): void {
      core.receive(frame)
    },
    /** (Re)opens the document: catch-up from the confirmed version and resubmit of the in-flight transaction. */
    connect(): void {
      core.hello()
    },
    /** Marks the transport closed; edits keep accumulating in the buffer. */
    disconnect(): void {
      core.connected = false
    },
  }
}

/** A collab client instance. */
export type CollabClient = ReturnType<typeof createCollabClient>
