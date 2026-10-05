import type { DocNodeRecord, DocOp } from '../ot/types.js'
import type { CollabAccess, CollabPeer, CollabServerHooks } from './collabServer.js'
import { fieldValuesEqual } from '@rstore/shared'
import { applyDocOps } from '../ot/doc/apply.js'
import { createDocState } from '../ot/doc/state.js'
import { rewriteForView } from './redactRewrite.js'

/** Ids an op references (its target, sources and created nodes). */
export function referencedIds(op: DocOp): string[] {
  switch (op.t) {
    case 'insertNode':
      return [op.node.id]
    case 'splitNode':
      return [op.node, op.newNode]
    case 'mergeNode':
      return [op.node, op.into]
    default:
      return [op.node]
  }
}

/** How an op reaches a peer: as is, not at all, or rewritten from node views. */
type OpDisposition = 'keep' | 'drop' | 'rewrite'

/** Ops redacted for one peer; `rewritten` lists the nodes of rewritten ops. */
export interface RedactedOps {
  ops: DocOp[]
  rewritten: string[]
}

/**
 * Applies the `redact` hook for one peer.
 *
 * - `nodes()`: the redacted snapshot of `nodes`.
 * - `ops(ops, before)`: an entry's ops for the peer. Ops on visible,
 *   unreduced nodes pass as is; ops only on hidden nodes are dropped (an
 *   empty list still advances the peer's version). Ops that mix hidden and
 *   visible nodes, or touch nodes the hook reduces, are replayed on `before`
 *   (the document before the entry) and sent as the changes of the peer's
 *   view of each node, so hidden ids and values never leak. Without
 *   `before`, such ops cannot be rewritten: `ops` returns `null`.
 *
 * Visibility is decided on `nodes` (the rows after the entry), falling back
 * to `before`; it must not change over a node's life.
 */
export function createRedactor(redact: CollabServerHooks['redact'], subscription: { peer: CollabPeer, access: CollabAccess }, nodes: DocNodeRecord[]) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  // Views are memoized per record object: records are immutable.
  const views = new WeakMap<DocNodeRecord, DocNodeRecord | null>()
  /** The node as the peer may see it (`null` when hidden). */
  const view = (node: DocNodeRecord): DocNodeRecord | null => {
    if (!redact) {
      return node
    }
    let result = views.get(node)
    if (result === undefined) {
      result = redact({ peer: subscription.peer, role: subscription.access.role, node })
      views.set(node, result)
    }
    return result
  }
  /** Visibility of a node: hidden, reduced (the view differs) or plain. */
  const status = (node: DocNodeRecord | undefined): 'hidden' | 'reduced' | 'plain' => {
    const seen = node ? view(node) : undefined
    return seen === null ? 'hidden' : seen && seen !== node && !fieldValuesEqual(seen, node) ? 'reduced' : 'plain'
  }
  const disposition = (op: DocOp, before: () => Map<string, DocNodeRecord> | undefined): OpDisposition => {
    // Ops always touch the nodes they reference, so `before` is rarely needed.
    const statuses = referencedIds(op).map(id => status(byId.get(id) ?? before()?.get(id)))
    if (statuses.every(value => value === 'plain')) {
      return 'keep'
    }
    return statuses.every(value => value === 'hidden') ? 'drop' : 'rewrite'
  }

  return {
    nodes: (): DocNodeRecord[] => nodes.map(view).filter((node): node is DocNodeRecord => node !== null),
    ops(ops: DocOp[], before?: DocNodeRecord[]): RedactedOps | null {
      if (!redact) {
        return { ops, rewritten: [] }
      }
      let beforeById: Map<string, DocNodeRecord> | undefined
      const lookup = () => (beforeById ??= before && new Map(before.map(node => [node.id, node])))
      const dispositions = ops.map(op => disposition(op, lookup))
      if (!dispositions.includes('rewrite')) {
        return { ops: ops.filter((_, index) => dispositions[index] === 'keep'), rewritten: [] }
      }
      if (!before) {
        return null
      }
      // Replay the entry op by op to know each node before and after each op.
      const state = createDocState('', before, 0)
      const result: RedactedOps = { ops: [], rewritten: [] }
      ops.forEach((op, index) => {
        const ids = referencedIds(op)
        const previous = new Map(ids.map(id => [id, state.nodes.get(id)]))
        applyDocOps(state, [op])
        if (dispositions[index] === 'keep') {
          result.ops.push(op)
        }
        else if (dispositions[index] === 'rewrite') {
          const viewOf = (node: DocNodeRecord | undefined) => node ? view(node) : null
          result.ops.push(...rewriteForView(
            ids,
            new Map(ids.map(id => [id, viewOf(previous.get(id))])),
            new Map(ids.map(id => [id, viewOf(state.nodes.get(id))])),
          ))
          result.rewritten.push(...ids)
        }
      })
      return result
    },
  }
}
