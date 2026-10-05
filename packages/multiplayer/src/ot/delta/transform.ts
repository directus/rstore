import type { MarkExpandPolicy, TextOp, TransformOptions } from '../types.js'
import type { AttributeMap } from './attributes.js'
import { fieldValuesEqual } from '@rstore/shared'
import { resolveExpandPolicy } from '../marks.js'
import { nonEmpty, transformAttributes } from './attributes.js'
import { TextOpBuilder } from './builder.js'
import { componentLength, TextOpIterator } from './iterator.js'

/** A range of base units an op formats, with the format attributes. */
interface FormatSegment {
  start: number
  end: number
  attributes: AttributeMap
}

/** Base ranges an op formats (retains with attributes), in base coordinates. */
function formatSegments(op: TextOp): FormatSegment[] {
  const segments: FormatSegment[] = []
  let position = 0
  for (const component of op) {
    if ('insert' in component) {
      continue
    }
    const length = componentLength(component)
    if ('retain' in component && component.attributes) {
      segments.push({ start: position, end: position + length, attributes: component.attributes })
    }
    position += length
  }
  return segments
}

/** Format attributes an op applies to base unit `index`. */
function formatAt(segments: FormatSegment[], index: number): AttributeMap | undefined {
  for (const segment of segments) {
    if (index < segment.start) {
      return undefined
    }
    if (index < segment.end) {
      return segment.attributes
    }
  }
  return undefined
}

/**
 * Marks a concurrent format op extends over text inserted at base position
 * `position`: expandable keys the op sets to the same value (or removes) on
 * both neighbouring units, i.e. the insert falls strictly inside the range.
 */
function expansionAt(segments: FormatSegment[], position: number, expand: MarkExpandPolicy): AttributeMap | undefined {
  if (position === 0 || segments.length === 0) {
    return undefined
  }
  const before = formatAt(segments, position - 1)
  const after = before && formatAt(segments, position)
  if (!before || !after) {
    return undefined
  }
  let result: AttributeMap | undefined
  for (const key in before) {
    if (expand(key) && key in after && fieldValuesEqual(before[key], after[key])) {
      result ??= {}
      result[key] = before[key]
    }
  }
  return result
}

/** Marks of an insert once a concurrent format extends over it (`null` removes). */
function expandInsertAttributes(attributes: AttributeMap | undefined, expansion: AttributeMap | undefined): AttributeMap | undefined {
  if (!expansion) {
    return attributes
  }
  const result: AttributeMap = { ...attributes }
  for (const key in expansion) {
    if (expansion[key] === null) {
      delete result[key]
    }
    else {
      result[key] = expansion[key]
    }
  }
  return nonEmpty(result)
}

/**
 * Transforms `op` so it applies after `against`, both authored on the same
 * content (TP1: `apply(apply(s, against), T(op, against))` equals
 * `apply(apply(s, op), T(against, op))` when the `opIsFirst` flags are opposite).
 *
 * - Insert ties at the same position: the first sequenced op goes first.
 * - Format conflicts on the same key: the later sequenced op wins.
 * - Text inserted strictly inside a range the other op formats takes the
 *   expandable marks of that format (`options.expand`).
 *
 * @param op Operation to transform.
 * @param against Concurrent operation applied first.
 * @param opIsFirst Whether `op` was sequenced before `against`.
 */
export function transformTextOp(op: TextOp, against: TextOp, opIsFirst: boolean, options?: TransformOptions): TextOp {
  const expand = resolveExpandPolicy(options)
  const againstFormats = formatSegments(against)
  const opFormats = formatSegments(op)
  const againstIterator = new TextOpIterator(against)
  const opIterator = new TextOpIterator(op)
  const builder = new TextOpBuilder()
  // Base units consumed so far: where an insert lands in the original content.
  let position = 0
  while (againstIterator.hasNext() || opIterator.hasNext()) {
    if (againstIterator.peekType() === 'insert' && (!opIsFirst || opIterator.peekType() !== 'insert')) {
      const length = componentLength(againstIterator.next())
      builder.retain(length, expansionAt(opFormats, position, expand))
    }
    else if (opIterator.peekType() === 'insert') {
      const insert = opIterator.next() as { insert: string, attributes?: AttributeMap }
      builder.insert(insert.insert, expandInsertAttributes(insert.attributes, expansionAt(againstFormats, position, expand)))
    }
    else {
      const length = Math.min(againstIterator.peekLength(), opIterator.peekLength())
      const againstComponent = againstIterator.next(length)
      const opComponent = opIterator.next(length)
      position += length
      if ('delete' in againstComponent) {
        continue
      }
      if ('delete' in opComponent) {
        builder.delete(length)
      }
      else {
        const againstAttributes = 'retain' in againstComponent ? againstComponent.attributes : undefined
        builder.retain(length, transformAttributes(againstAttributes, (opComponent as { attributes?: AttributeMap }).attributes, !opIsFirst))
      }
    }
  }
  return builder.chop()
}

/**
 * Maps an offset through an op. With `'right'` affinity an insert at the
 * offset pushes it right; with `'left'` it stays before the insert. Offsets
 * inside a deleted range collapse to its start.
 */
export function transformTextPosition(op: TextOp, index: number, affinity: 'left' | 'right'): number {
  const iterator = new TextOpIterator(op)
  let offset = 0
  while (iterator.hasNext() && offset <= index) {
    const length = iterator.peekLength()
    const type = iterator.peekType()
    iterator.next()
    if (type === 'delete') {
      index -= Math.min(length, index - offset)
      continue
    }
    if (type === 'insert' && (offset < index || affinity === 'right')) {
      index += length
    }
    offset += length
  }
  return index
}
