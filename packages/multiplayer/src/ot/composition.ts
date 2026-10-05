import type { CollabClient } from './client.js'
import type { Delta, DocOp, TextOp, TransformOptions } from './types.js'
import { diffDelta } from './delta/diff.js'
import { composeDocOps, docOpTouches } from './doc/compose.js'
import { transformDocOps } from './doc/transform.js'

/** Options of `createCompositionGuard`. */
export interface CompositionGuardOptions {
  /** Force a flush after holding remote ops this long. @default 10_000 */
  maxHoldMs?: number
  /** Force a flush after holding this many remote ops. @default 500 */
  maxQueuedOps?: number
  /** Must match the client's transform options. */
  transform?: TransformOptions
  /** @default Date.now */
  now?: () => number
  /**
   * Reads the view content of the composing node, which a forced flush
   * needs to build the composition op. Without it the guard holds until
   * the composition ends.
   */
  readComposingContent?: (nodeId: string) => Delta | undefined
  /** Receives the ops of a forced flush, to apply to the view. */
  onForcedFlush?: (dispatch: DocOp[]) => void
}

/** Result of ending a composition. */
export interface CompositionEnd {
  /** Ops the guard submitted to the client (the composition, rebased). */
  submitted: DocOp[]
  /** Held remote ops, rebased over the composition, to apply to the view now. */
  dispatch: DocOp[]
}

/**
 * IME safety for an editor binding. While the user composes in a node, the
 * editor's intermediate transactions for that node are not sent (Android
 * and Safari rewrite the composed text several times); remote transactions
 * touching the node are held back from the view. At composition end the
 * guard diffs the node once, rebases that single op over the held remote
 * ops, submits it, and returns the held ops rebased over it for the view.
 */
export function createCompositionGuard(client: CollabClient, options: CompositionGuardOptions = {}) {
  const maxHoldMs = options.maxHoldMs ?? 10_000
  const maxQueuedOps = options.maxQueuedOps ?? 500
  const now = options.now ?? Date.now
  let nodeId: string | null = null
  let base: Delta = []
  let held: DocOp[] = []
  /** Remote ops received while holding (held ones are composed, so fewer). */
  let heldCount = 0
  let heldSince = 0

  /** Builds, rebases and submits the composition; returns held ops for the view. */
  function finish(content: Delta): CompositionEnd {
    const composition: DocOp[] = []
    const ops: TextOp = diffDelta(base, content)
    if (ops.length) {
      composition.push({ t: 'text', node: nodeId!, ops })
    }
    const { first: dispatch, later: submitted } = transformDocOps(held, composition, options.transform)
    nodeId = null
    held = []
    heldCount = 0
    if (submitted.length) {
      client.submit(submitted)
    }
    return { submitted, dispatch }
  }

  /**
   * Safety valve: when remote ops were held too long (or too many), submits
   * the composition so far and hands the held ops to `onForcedFlush`, at the
   * cost of updating the view mid-composition. Call it from a timer too.
   */
  function flushIfOverdue(): void {
    const overdue = heldCount >= maxQueuedOps || (heldCount > 0 && now() - heldSince >= maxHoldMs)
    const content = overdue && nodeId !== null ? options.readComposingContent?.(nodeId) : undefined
    if (!content) {
      return
    }
    const id = nodeId!
    const result = finish(content)
    options.onForcedFlush?.(result.dispatch)
    // The browser keeps composing: track it from the flushed content.
    nodeId = id
    base = client.state.nodes.get(id)?.content ?? []
  }

  return {
    /** Whether a composition is in progress. */
    get composing(): boolean {
      return nodeId !== null
    },
    /** The node being composed in. */
    get nodeId(): string | null {
      return nodeId
    },
    /** `compositionstart` in a textblock: remembers its confirmed-to-view content. */
    start(id: string): void {
      const node = client.state.nodes.get(id)
      nodeId = id
      base = node?.content ?? []
      held = []
      heldCount = 0
    },
    /**
     * A remote change (`change` event, origin `remote`): returns the ops to
     * apply to the view now, or `null` while they are held. Once a remote
     * transaction touches the composing node, every later one is held too,
     * so the view applies them in order.
     */
    receive(ops: DocOp[]): DocOp[] | null {
      if (nodeId === null || (!heldCount && !ops.some(op => docOpTouches(op, nodeId!)))) {
        return ops
      }
      if (!heldCount) {
        heldSince = now()
      }
      heldCount += ops.length
      held = composeDocOps(held, ops)
      flushIfOverdue()
      return null
    },
    flushIfOverdue,
    /** `compositionend`: `content` is the node's content in the view. */
    end(content: Delta): CompositionEnd {
      if (nodeId === null) {
        return { submitted: [], dispatch: [] }
      }
      return finish(content)
    },
  }
}

/** A composition guard instance. */
export type CompositionGuard = ReturnType<typeof createCompositionGuard>
