import type { Delta, TextOp, TextOpComponent } from '../types.js'
import { isRecord } from '../../protocol/record.js'
import { OtValidationError } from '../errors.js'
import { composeAttributes } from './attributes.js'
import { normalizeDelta, TextOpBuilder } from './builder.js'
import { TextOpIterator } from './iterator.js'

/** Upper bound for a single component length, so bogus frames fail fast. */
const MAX_COMPONENT_LENGTH = 1e7

/** Whether a code unit is a high (leading) surrogate. */
function isHighSurrogate(code: number): boolean {
  return code >= 0xD800 && code <= 0xDBFF
}

/** Whether a code unit is a low (trailing) surrogate. */
function isLowSurrogate(code: number): boolean {
  return code >= 0xDC00 && code <= 0xDFFF
}

/** Whether offset `index` of `text` falls between the two halves of a surrogate pair. */
export function splitsSurrogatePair(text: string, index: number): boolean {
  return index > 0 && index < text.length
    && isHighSurrogate(text.charCodeAt(index - 1))
    && isLowSurrogate(text.charCodeAt(index))
}

/** Throws unless the component is structurally valid. */
export function validateComponent(component: TextOpComponent): void {
  if (!isRecord(component)) {
    throw new OtValidationError('text op component must be an object')
  }
  const attributes = (component as { attributes?: unknown }).attributes
  if (attributes !== undefined && !isRecord(attributes)) {
    throw new OtValidationError('attributes must be an object')
  }
  if ('insert' in component) {
    if (typeof component.insert === 'string') {
      if (component.insert.length === 0 || !component.insert.isWellFormed()) {
        throw new OtValidationError('inserted text must be non-empty and contain no lone surrogate')
      }
    }
    else if (!isRecord(component.insert) || Object.keys(component.insert).length !== 1) {
      throw new OtValidationError('an embed must be an object with exactly one key')
    }
    if (attributes && Object.values(attributes).includes(null)) {
      throw new OtValidationError('inserted marks cannot be null')
    }
    return
  }
  const length = 'retain' in component ? component.retain : (component as { delete?: unknown }).delete
  if (typeof length !== 'number' || !Number.isInteger(length) || length <= 0 || length > MAX_COMPONENT_LENGTH) {
    throw new OtValidationError('retain and delete lengths must be positive integers')
  }
}

/**
 * Plain text of content with each embed as U+FFFC, used to check that op
 * boundaries never fall inside a surrogate pair.
 */
function boundaryText(content: Delta): string {
  let text = ''
  for (const run of content) {
    text += typeof run.insert === 'string' ? run.insert : '\uFFFC'
  }
  return text
}

/**
 * Applies a text op to textblock content and returns the new normalized
 * content. Throws `OtValidationError` when the op is malformed, runs past the
 * content, or places a boundary inside a surrogate pair.
 *
 * @param content Current inline content.
 * @param op Operation authored against `content`.
 */
export function applyTextOp(content: Delta, op: TextOp): Delta {
  const text = boundaryText(content)
  const contentIterator = new TextOpIterator(content)
  const builder = new TextOpBuilder()
  let position = 0
  const checkBoundary = (offset: number) => {
    if (offset > text.length) {
      throw new OtValidationError(`op runs past the content (${offset} > ${text.length})`)
    }
    if (splitsSurrogatePair(text, offset)) {
      throw new OtValidationError(`op boundary ${offset} splits a surrogate pair`)
    }
  }
  for (const component of op) {
    validateComponent(component)
    checkBoundary(position)
    if ('insert' in component) {
      builder.insert(component.insert, component.attributes)
      continue
    }
    const length = 'retain' in component ? component.retain : component.delete
    checkBoundary(position + length)
    position += length
    let remaining = length
    while (remaining > 0) {
      const piece = contentIterator.next(remaining) as { insert: string, attributes?: Record<string, unknown> }
      remaining -= typeof piece.insert === 'string' ? piece.insert.length : 1
      if ('retain' in component) {
        builder.insert(piece.insert, composeAttributes(piece.attributes, component.attributes, false))
      }
    }
  }
  while (contentIterator.hasNext()) {
    builder.push(contentIterator.next())
  }
  return normalizeDelta(builder.ops as Delta)
}
