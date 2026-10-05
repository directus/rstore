import type { DocOp, TextOp } from './types.js'

/**
 * For each unit of `base` after the text `ops`, the index of the base unit it
 * is, or -1 for an inserted unit. `null` when the ops do not apply. Unlike a
 * diff of the texts, this tells an own character typed in place of someone
 * else's identical character from a format change of that character.
 */
export function textUnitOrigins(baseLength: number, ops: TextOp[]): Int32Array | null {
  let origins = Array.from({ length: baseLength }, (_, index) => index)
  for (const op of ops) {
    const next: number[] = []
    let position = 0
    for (const component of op) {
      if ('insert' in component) {
        const length = typeof component.insert === 'string' ? component.insert.length : 1
        for (let i = 0; i < length; i++) {
          next.push(-1)
        }
        continue
      }
      const length = 'retain' in component ? component.retain : component.delete
      if (position + length > origins.length) {
        return null
      }
      if ('retain' in component) {
        next.push(...origins.slice(position, position + length))
      }
      position += length
    }
    next.push(...origins.slice(position))
    origins = next
  }
  return Int32Array.from(origins)
}

/**
 * The text ops of `pending` on node `id`, or `null` when another pending op
 * touches it (a split or merge moves units between nodes: identities are
 * then left to the text diff).
 */
export function pendingTextOps(pending: DocOp[], id: string): TextOp[] | null {
  const ops: TextOp[] = []
  for (const op of pending) {
    if (op.t === 'text' && op.node === id) {
      ops.push(op.ops)
    }
    else if ((op.t === 'splitNode' && (op.node === id || op.newNode === id)) || (op.t === 'mergeNode' && (op.node === id || op.into === id))) {
      return null
    }
  }
  return ops
}
