import type { DocOp } from '../types.js'
import { composeTextOps } from '../delta/compose.js'

/** Whether an op reads or writes node `id` (content, flags, place or identity). */
export function docOpTouches(op: DocOp, id: string): boolean {
  switch (op.t) {
    case 'insertNode':
      return op.node.id === id
    case 'splitNode':
      return op.node === id || op.newNode === id
    case 'mergeNode':
      return op.node === id || op.into === id
    default:
      return op.node === id
  }
}

/**
 * Appends `next` to `ops` (both applied in order), folding each text op into
 * the previous text op on the same node when no op in between touches that
 * node. Keeps pending buffers small: a long offline session typing in a few
 * nodes stays a few ops.
 */
export function composeDocOps(ops: DocOp[], next: DocOp[]): DocOp[] {
  const result = ops.slice()
  for (const op of next) {
    if (op.t === 'text' && foldText(result, op)) {
      continue
    }
    result.push(op)
  }
  return result
}

/** Folds a text op into an earlier one on the same node; `false` when not possible. */
function foldText(ops: DocOp[], op: Extract<DocOp, { t: 'text' }>): boolean {
  for (let i = ops.length - 1; i >= 0; i--) {
    const candidate = ops[i]!
    if (!docOpTouches(candidate, op.node)) {
      continue
    }
    if (candidate.t !== 'text') {
      return false
    }
    const composed = composeTextOps(candidate.ops, op.ops)
    if (composed.length) {
      ops[i] = { t: 'text', node: op.node, ops: composed }
    }
    else {
      ops.splice(i, 1)
    }
    return true
  }
  return false
}
