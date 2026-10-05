import type { TextOp, TextOpComponent } from '../types.js'

/** Kind of a text op component. */
export type ComponentType = 'insert' | 'retain' | 'delete'

/** Length of a component in UTF-16 code units (an embed counts as 1). */
export function componentLength(component: TextOpComponent): number {
  if ('delete' in component) {
    return component.delete
  }
  if ('retain' in component) {
    return component.retain
  }
  return typeof component.insert === 'string' ? component.insert.length : 1
}

/** Kind of a component. */
export function componentType(component: TextOpComponent): ComponentType {
  if ('delete' in component) {
    return 'delete'
  }
  return 'retain' in component ? 'retain' : 'insert'
}

/**
 * Walks the components of an op (or the runs of a Delta) and hands out
 * slices of a requested length. Past the end it yields an infinite plain
 * retain, so two iterators can be advanced in lockstep without bounds checks.
 */
export class TextOpIterator {
  private index = 0
  private offset = 0

  constructor(private readonly ops: TextOp) {}

  /** Whether a real component remains. */
  hasNext(): boolean {
    return this.index < this.ops.length
  }

  /** Remaining length of the current component (`Infinity` past the end). */
  peekLength(): number {
    const op = this.ops[this.index]
    return op ? componentLength(op) - this.offset : Number.POSITIVE_INFINITY
  }

  /** Kind of the current component (`retain` past the end). */
  peekType(): ComponentType {
    const op = this.ops[this.index]
    return op ? componentType(op) : 'retain'
  }

  /** Takes up to `length` units of the current component. */
  next(length = Number.POSITIVE_INFINITY): TextOpComponent {
    const op = this.ops[this.index]
    if (!op) {
      return { retain: Number.POSITIVE_INFINITY }
    }
    const offset = this.offset
    const remaining = componentLength(op) - offset
    if (length >= remaining) {
      length = remaining
      this.index++
      this.offset = 0
    }
    else {
      this.offset += length
    }
    if ('delete' in op) {
      return { delete: length }
    }
    if ('retain' in op) {
      return op.attributes ? { retain: length, attributes: op.attributes } : { retain: length }
    }
    const insert = typeof op.insert === 'string' ? op.insert.slice(offset, offset + length) : op.insert
    return op.attributes ? { insert, attributes: op.attributes } : { insert }
  }
}
