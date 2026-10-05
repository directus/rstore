import type { Delta, DeltaAttributes, DeltaEmbed, TextOp, TextOpComponent } from './types.js'
import { mergeText } from '../text/merge.js'
import { attributesEqual, diffAttributes } from './delta/attributes.js'
import { normalizeDelta, normalizeTextOp } from './delta/builder.js'
import { diffTextSafe } from './delta/diff.js'
import { TextOpIterator } from './delta/iterator.js'

/** One UTF-16 unit of content with its marks (an embed is one unit). */
interface Unit {
  char: string
  embed?: DeltaEmbed
  attributes?: DeltaAttributes
}

/** Content as units, and its plain text (embeds as U+FFFC). */
function toUnits(content: Delta): { text: string, units: Unit[] } {
  const units: Unit[] = []
  const iterator = new TextOpIterator(content)
  while (iterator.hasNext()) {
    const run = iterator.next(1) as { insert: string | DeltaEmbed, attributes?: DeltaAttributes }
    units.push(typeof run.insert === 'string'
      ? { char: run.insert, attributes: run.attributes }
      : { char: '\uFFFC', embed: run.insert, attributes: run.attributes })
  }
  return { text: units.map(unit => unit.char).join(''), units }
}

/** For each index of `from`, its index in `to`, or -1 when the diff deletes it. */
function positionMap(from: string, to: string): Int32Array {
  const map = new Int32Array(from.length).fill(-1)
  let fromIndex = 0
  let toIndex = 0
  for (const change of diffTextSafe(from, to)) {
    for (; fromIndex < change.index; fromIndex++, toIndex++) {
      map[fromIndex] = toIndex
    }
    fromIndex += change.deleteCount
    toIndex += change.insertText.length
  }
  for (; fromIndex < from.length; fromIndex++, toIndex++) {
    map[fromIndex] = toIndex
  }
  return map
}

/** Inverts a position map into `to`-indexed sources. */
function sources(map: Int32Array, length: number): Int32Array {
  const result = new Int32Array(length).fill(-1)
  map.forEach((target, source) => {
    if (target >= 0) {
      result[target] = source
    }
  })
  return result
}

/**
 * Result of `mergeContent`: the merged content and the op turning the
 * server content into it (deletes and inserts, never a re-labelling of a
 * server unit the local side did not format).
 */
export type ContentMergeResult = { status: 'merged', content: Delta, ops: TextOp } | { status: 'conflict' }

/** Where a merged unit comes from: a kept server unit (with its marks) or a local unit. */
type MergedUnit = { server: number, attributes: DeltaAttributes | undefined } | { local: Unit }

/** Base marks with the keys the local side changed (added, changed or removed) applied over the server marks. */
function mergeMarks(base: DeltaAttributes | undefined, local: DeltaAttributes | undefined, server: DeltaAttributes | undefined): DeltaAttributes | undefined {
  const result: DeltaAttributes = { ...server }
  for (const key of new Set([...Object.keys(base ?? {}), ...Object.keys(local ?? {})])) {
    const value = local?.[key]
    if (attributesEqual({ v: value }, { v: base?.[key] })) {
      continue
    }
    if (value === undefined) {
      delete result[key]
    }
    else {
      result[key] = value
    }
  }
  return Object.keys(result).length ? result : undefined
}

/**
 * Three-way merge of a textblock edited offline past the op log retention:
 * a plain-text merge (`mergeText`), then each merged unit is attributed to
 * the server or the local side. Units the server has keep the server marks,
 * with the mark keys the local side changed on that same base unit applied
 * over them; units only the local side has keep their own marks. A local
 * unit typed in place of a base unit it deleted stays local even when the
 * characters are equal, so another user's character is never re-labelled.
 * `localOrigins` (from the pending ops, see `textUnitOrigins`) gives the
 * exact local identities; without it they come from a text diff. A merge
 * that would drop a unit the server added since the base is a conflict.
 */
export function mergeContent(base: Delta, local: Delta, server: Delta, localOrigins?: Int32Array | null): ContentMergeResult {
  const b = toUnits(base)
  const l = toUnits(local)
  const s = toUnits(server)
  const result = mergeText(b.text, l.text, s.text)
  if (result.conflicts.length) {
    return { status: 'conflict' }
  }
  const merged = result.merged
  const fromLocal = sources(positionMap(l.text, merged), merged.length)
  const serverToMerged = positionMap(s.text, merged)
  const fromServer = sources(serverToMerged, merged.length)
  const localToBase = localOrigins && localOrigins.length === l.units.length ? localOrigins : positionMap(l.text, b.text)
  const keptLocally = new Set(localToBase)
  const serverToBase = positionMap(s.text, b.text)
  // Every unit the server added since the base must survive the merge.
  for (let index = 0; index < s.units.length; index++) {
    if (serverToBase[index]! < 0 && serverToMerged[index]! < 0) {
      return { status: 'conflict' }
    }
  }
  const units: MergedUnit[] = []
  for (let i = 0; i < merged.length; i++) {
    const localIndex = fromLocal[i]!
    const serverIndex = fromServer[i]!
    const localUnit = localIndex >= 0 ? l.units[localIndex] : undefined
    const baseOfLocal = localIndex >= 0 ? localToBase[localIndex]! : -1
    const baseOfServer = serverIndex >= 0 ? serverToBase[serverIndex]! : -1
    if (serverIndex < 0 || (localUnit && baseOfLocal < 0 && baseOfServer >= 0 && !keptLocally.has(baseOfServer))) {
      units.push({ local: localUnit ?? { char: merged[i]! } })
    }
    else if (localUnit && baseOfServer >= 0 && baseOfLocal === baseOfServer) {
      // A base unit both sides kept: local mark changes win key by key.
      units.push({ server: serverIndex, attributes: mergeMarks(b.units[baseOfServer]!.attributes, localUnit.attributes, s.units[serverIndex]!.attributes) })
    }
    else {
      units.push({ server: serverIndex, attributes: s.units[serverIndex]!.attributes })
    }
  }
  return { status: 'merged', ...buildMerge(s.units, units) }
}

/** Merged content and the op turning the server units into it. */
function buildMerge(server: Unit[], units: MergedUnit[]): { content: Delta, ops: TextOp } {
  const ops: TextOpComponent[] = []
  const content: Delta = []
  let next = 0
  for (const unit of units) {
    if ('local' in unit) {
      const run = { insert: unit.local.embed ?? unit.local.char, ...(unit.local.attributes ? { attributes: unit.local.attributes } : {}) }
      ops.push(run)
      content.push(run)
      continue
    }
    if (unit.server > next) {
      ops.push({ delete: unit.server - next })
    }
    const kept = server[unit.server]!
    const format = diffAttributes(kept.attributes, unit.attributes)
    ops.push(format ? { retain: 1, attributes: format } : { retain: 1 })
    content.push({ insert: kept.embed ?? kept.char, ...(unit.attributes ? { attributes: unit.attributes } : {}) })
    next = unit.server + 1
  }
  if (next < server.length) {
    ops.push({ delete: server.length - next })
  }
  return { content: normalizeDelta(content), ops: normalizeTextOp(ops) }
}
