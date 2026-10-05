import type { Delta, TextOp } from '../types.js'
import { composeAttributes, invertAttributes } from './attributes.js'
import { TextOpBuilder } from './builder.js'
import { componentLength, TextOpIterator } from './iterator.js'

/**
 * One op equivalent to applying `a` then `b` (`b` is authored on the result
 * of `a`). Used to fold buffered local edits into one pending transaction.
 */
export function composeTextOps(a: TextOp, b: TextOp): TextOp {
  const first = new TextOpIterator(a)
  const second = new TextOpIterator(b)
  const builder = new TextOpBuilder()
  while (first.hasNext() || second.hasNext()) {
    if (second.peekType() === 'insert') {
      builder.push(second.next())
      continue
    }
    if (first.peekType() === 'delete') {
      builder.push(first.next())
      continue
    }
    const length = Math.min(first.peekLength(), second.peekLength())
    const aComponent = first.next(length)
    const bComponent = second.next(length)
    if ('retain' in bComponent) {
      if ('retain' in aComponent) {
        builder.retain(length, composeAttributes(aComponent.attributes, bComponent.attributes, true))
      }
      else if ('insert' in aComponent) {
        builder.insert(aComponent.insert, composeAttributes(aComponent.attributes, bComponent.attributes, false))
      }
    }
    else if ('delete' in bComponent && 'retain' in aComponent) {
      builder.delete(length)
    }
    // An insert of `a` deleted by `b` cancels out.
  }
  return builder.chop()
}

/**
 * The op that undoes `op` on content `base` (the content `op` was applied
 * to): inserts become deletes, deletes re-insert the original runs with their
 * marks, and formats restore the previous marks.
 */
export function invertTextOp(op: TextOp, base: Delta): TextOp {
  const builder = new TextOpBuilder()
  const baseIterator = new TextOpIterator(base)
  for (const component of op) {
    if ('insert' in component) {
      builder.delete(componentLength(component))
      continue
    }
    if ('retain' in component && !component.attributes) {
      builder.retain(component.retain)
      for (let skipped = 0; skipped < component.retain;) {
        skipped += componentLength(baseIterator.next(component.retain - skipped))
      }
      continue
    }
    let remaining = 'retain' in component ? component.retain : component.delete
    while (remaining > 0) {
      const piece = baseIterator.next(remaining)
      const length = componentLength(piece)
      remaining -= length
      if ('delete' in component) {
        builder.push(piece)
      }
      else {
        builder.retain(length, invertAttributes(component.attributes, (piece as { attributes?: Record<string, unknown> }).attributes))
      }
    }
  }
  return builder.chop()
}
