import type { TextChange } from '../../text/index.js'
import type { Delta, DeltaEmbed, TextOp } from '../types.js'
import type { AttributeMap } from './attributes.js'
import { diffText } from '../../text/index.js'
import { splitsSurrogatePair } from './apply.js'
import { diffAttributes } from './attributes.js'
import { TextOpBuilder } from './builder.js'
import { componentLength, TextOpIterator } from './iterator.js'

/** A replaced range in both the source and the target string. */
interface Hunk {
  sourceStart: number
  sourceEnd: number
  targetStart: number
  targetEnd: number
}

/**
 * Like `diffText`, but no change starts or ends inside a surrogate pair:
 * `diffText` compares code units, so two emoji sharing a high surrogate
 * would yield a change that replaces only the low half. Such changes are
 * widened to whole code points, and changes that then touch are merged.
 */
export function diffTextSafe(source: string, target: string): TextChange[] {
  const hunks: Hunk[] = []
  let shift = 0
  for (const change of diffText(source, target)) {
    const hunk = {
      sourceStart: change.index,
      sourceEnd: change.index + change.deleteCount,
      targetStart: change.index + shift,
      targetEnd: change.index + shift + change.insertText.length,
    }
    shift += change.insertText.length - change.deleteCount
    // The text around a change is common to both strings, so widening by one
    // unit on one side widens by the same unit on the other.
    if (splitsSurrogatePair(source, hunk.sourceStart) || splitsSurrogatePair(target, hunk.targetStart)) {
      hunk.sourceStart--
      hunk.targetStart--
    }
    if (splitsSurrogatePair(source, hunk.sourceEnd) || splitsSurrogatePair(target, hunk.targetEnd)) {
      hunk.sourceEnd++
      hunk.targetEnd++
    }
    const previous = hunks.at(-1)
    if (previous && hunk.sourceStart <= previous.sourceEnd) {
      previous.sourceEnd = Math.max(previous.sourceEnd, hunk.sourceEnd)
      previous.targetEnd = Math.max(previous.targetEnd, hunk.targetEnd)
    }
    else {
      hunks.push(hunk)
    }
  }
  return hunks.map(hunk => ({
    index: hunk.sourceStart,
    deleteCount: hunk.sourceEnd - hunk.sourceStart,
    insertText: target.slice(hunk.targetStart, hunk.targetEnd),
  }))
}

/**
 * Maps each distinct embed of both contents to a private-use character that
 * appears in neither text, so a plain string diff also compares embeds.
 */
function embedEncoder(before: Delta, after: Delta): (run: { insert: string | DeltaEmbed }) => string {
  const used = new Set<string>()
  for (const run of [...before, ...after]) {
    if (typeof run.insert === 'string') {
      for (const char of run.insert) {
        used.add(char)
      }
    }
  }
  const codes = new Map<string, string>()
  let next = 0xE000
  return (run) => {
    if (typeof run.insert === 'string') {
      return run.insert
    }
    const key = stableStringify(run.insert)
    let code = codes.get(key)
    if (!code) {
      while (used.has(String.fromCharCode(next))) {
        next++
      }
      code = String.fromCharCode(next++)
      codes.set(key, code)
    }
    return code
  }
}

/** JSON with sorted object keys, so equal embeds encode identically. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * The text op that turns `before` into `after`: a code-point safe text diff
 * (embeds included), plus format retains where unchanged text changed marks.
 * Used for IME composition results and editor bindings.
 */
export function diffDelta(before: Delta, after: Delta): TextOp {
  const encode = embedEncoder(before, after)
  const source = before.map(encode).join('')
  const target = after.map(encode).join('')
  const beforeIterator = new TextOpIterator(before)
  const afterIterator = new TextOpIterator(after)
  const builder = new TextOpBuilder()
  // Emits retains for `length` unchanged units, with mark changes per run.
  const keep = (length: number) => {
    while (length > 0) {
      const size = Math.min(length, beforeIterator.peekLength(), afterIterator.peekLength())
      const from = beforeIterator.next(size) as { attributes?: AttributeMap }
      const to = afterIterator.next(size) as { attributes?: AttributeMap }
      builder.retain(size, diffAttributes(from.attributes, to.attributes))
      length -= size
    }
  }
  let sourceIndex = 0
  for (const change of diffTextSafe(source, target)) {
    keep(change.index - sourceIndex)
    let inserted = change.insertText.length
    while (inserted > 0) {
      const run = afterIterator.next(inserted)
      inserted -= componentLength(run)
      builder.push(run)
    }
    let deleted = change.deleteCount
    while (deleted > 0) {
      deleted -= componentLength(beforeIterator.next(deleted))
    }
    builder.delete(change.deleteCount)
    sourceIndex = change.index + change.deleteCount
  }
  keep(source.length - sourceIndex)
  return builder.chop()
}

/** Text op turning plain string `before` into `after` (code-point safe). */
export function diffPlainText(before: string, after: string): TextOp {
  const builder = new TextOpBuilder()
  let index = 0
  for (const change of diffTextSafe(before, after)) {
    builder.retain(change.index - index)
    builder.insert(change.insertText)
    builder.delete(change.deleteCount)
    index = change.index + change.deleteCount
  }
  return builder.chop()
}
