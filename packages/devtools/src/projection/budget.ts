import type { PreviewValue } from '../protocol/preview'
import { ProjectionBudgetExceededError } from './errors'

/** Mutable shared allowance for a complete reply; callers reserve their envelope separately. */
export interface ProjectionBudget {
  /** Remaining UTF-8 bytes. */
  readonly remainingBytes: number
  /** UTF-8 bytes consumed by detached previews. */
  readonly consumedBytes: number
  /** Charge a completed projection once. */
  consume: (bytes: number) => void
}

/** Create a shared allowance without retaining any inspected values. */
export function createProjectionBudget(maxBytes = 512 * 1024): ProjectionBudget {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4)
    throw new RangeError('Projection byte budget must be an integer of at least 4')
  let consumed = 0
  return {
    get remainingBytes() { return maxBytes - consumed },
    get consumedBytes() { return consumed },
    consume(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes - consumed)
        throw new ProjectionBudgetExceededError()
      consumed += bytes
    },
  }
}

/**
 * UTF-8 byte length of well-formed text, counted without allocating an encoder.
 * `JSON.stringify` output is always well-formed (lone surrogates come out
 * escaped), so a high surrogate here always starts a 4-byte pair.
 */
export function utf8Length(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    }
    else if (code < 0x800) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4
        index++
      }
      else {
        bytes += 3
      }
    }
    else {
      bytes += 3
    }
  }
  return bytes
}

/** Measure only bounded, newly created DTOs; never stringify inspected source objects. */
export function jsonBytes(value: PreviewValue | [string, PreviewValue] | [PreviewValue, PreviewValue]): number {
  return utf8Length(JSON.stringify(value))
}

/**
 * Encoded size of one code point inside a JSON string literal, mirroring
 * `JSON.stringify`: short escapes for quote, backslash and \b\f\n\r\t,
 * `\uXXXX` for other control characters and lone surrogates, raw UTF-8 otherwise.
 */
function jsonCodePointBytes(codePoint: number): number {
  if (codePoint === 0x22 || codePoint === 0x5C || codePoint === 0x08 || codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0C || codePoint === 0x0D)
    return 2
  if (codePoint < 0x20 || (codePoint >= 0xD800 && codePoint <= 0xDFFF))
    return 6
  if (codePoint < 0x80)
    return 1
  if (codePoint < 0x800)
    return 2
  return codePoint < 0x10000 ? 3 : 4
}

/** Fit strings incrementally, accounting JSON escaping and complete UTF-8 code points. */
export function fitString(value: string, limit: number): { value: string, truncated: boolean } {
  // Common case: the whole string fits, measured once.
  if (jsonBytes(value) <= limit)
    return { value, truncated: false }
  let bytes = 2
  let end = 0
  for (const character of value) {
    const size = jsonCodePointBytes(character.codePointAt(0)!)
    if (bytes + size > limit)
      break
    bytes += size
    end += character.length
  }
  return { value: value.slice(0, end), truncated: true }
}
