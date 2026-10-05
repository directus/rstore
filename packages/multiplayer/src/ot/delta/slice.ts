import type { Delta, TextOp } from '../types.js'
import { normalizeDelta, TextOpBuilder } from './builder.js'
import { componentLength, TextOpIterator } from './iterator.js'

/** Runs of content between offsets `from` and `to` (default: the end). */
export function sliceDelta(content: Delta, from: number, to = Number.POSITIVE_INFINITY): Delta {
  const iterator = new TextOpIterator(content)
  const result: Delta = []
  let position = 0
  while (iterator.hasNext() && position < to) {
    if (position < from) {
      position += componentLength(iterator.next(from - position))
      continue
    }
    const run = iterator.next(to - position) as Delta[number]
    position += componentLength(run)
    result.push(run)
  }
  return result
}

/** Content of `a` followed by content of `b`, normalized. */
export function concatDelta(a: Delta, b: Delta): Delta {
  return normalizeDelta([...a, ...b])
}

/**
 * Cuts an op on content into the part that applies before offset `at` and
 * the part that applies to the content from `at` on (re-based to 0). An
 * insert exactly at `at` stays in the head (left affinity), as text typed at
 * a split point stays in the paragraph the caret was in.
 */
export function splitTextOp(op: TextOp, at: number): [TextOp, TextOp] {
  const head = new TextOpBuilder()
  const tail = new TextOpBuilder()
  const iterator = new TextOpIterator(op)
  let position = 0
  while (iterator.hasNext()) {
    if (iterator.peekType() === 'insert') {
      (position <= at ? head : tail).push(iterator.next())
      continue
    }
    if (position < at) {
      const component = iterator.next(at - position)
      position += componentLength(component)
      head.push(component)
    }
    else {
      const component = iterator.next()
      position += componentLength(component)
      tail.push(component)
    }
  }
  return [head.chop(), tail.chop()]
}

/** Shifts an op by `offset` units (a leading retain). */
export function shiftTextOp(op: TextOp, offset: number): TextOp {
  const builder = new TextOpBuilder().retain(offset)
  for (const component of op) {
    builder.push(component)
  }
  return builder.chop()
}
