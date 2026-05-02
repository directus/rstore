import type { FieldTimestampValue } from './hlc.js'
import { compareHLC, getDefaultClock, stringifyHLC } from './hlc.js'

/**
 * Field-level timestamps for Last-Writer-Wins (LWW) register.
 * Maps field names to the timestamp of their last modification.
 *
 * Values are either legacy wall-clock numbers (back-compat) or serialized
 * Hybrid Logical Clock strings. Both are compared via {@link compareHLC}.
 */
export type FieldTimestamps = Record<string, FieldTimestampValue>

export type { FieldTimestampValue } from './hlc.js'

/**
 * Describes a conflict on a single field where both local and remote
 * have different values at the same or overlapping timestamp.
 */
export interface FieldConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: FieldTimestampValue
  remoteTimestamp: FieldTimestampValue
}

/**
 * Result of merging two item versions at the field level.
 */
export interface MergeResult<T extends Record<string, any> = Record<string, any>> {
  /** The merged object with the winning value for each field */
  merged: T
  /** The merged per-field timestamps */
  mergedTimestamps: FieldTimestamps
  /** Fields where both local and remote had concurrent modifications */
  conflicts: FieldConflict[]
}

/**
 * A text change relative to a base string.
 * Deletes `deleteCount` characters starting at `index`, then inserts `insertText`.
 */
export interface TextChange {
  index: number
  deleteCount: number
  insertText: string
}

/**
 * Describes an overlapping text edit that cannot be merged automatically.
 */
export interface TextMergeConflict {
  index: number
  localChange: TextChange
  remoteChange: TextChange
}

/**
 * Result of merging two text values edited concurrently from the same base.
 */
export interface TextMergeResult {
  merged: string
  localChanges: TextChange[]
  remoteChanges: TextChange[]
  conflicts: TextMergeConflict[]
}

export type TextPositionAffinity = 'left' | 'right'

export interface TextRange {
  start: number
  end: number
}

export interface RebaseTextRangeOptions {
  startAffinity?: TextPositionAffinity
  endAffinity?: TextPositionAffinity
}

const MAX_TEXT_DIFF_MATRIX_CELLS = 4_000_000

/**
 * Merge two objects at the field level using LWW (Last-Writer-Wins) strategy.
 *
 * For each field present in either object:
 * - If only one side has a timestamp, that side's value is used.
 * - If both sides have timestamps, the higher timestamp wins.
 * - If timestamps are equal but values differ, it's recorded as a conflict
 *   and the local value is kept by default.
 *
 * @param local - The local version of the object
 * @param remote - The remote (incoming) version of the object
 * @param localTimestamps - Per-field timestamps for the local version
 * @param remoteTimestamps - Per-field timestamps for the remote version
 * @returns The merge result with merged data, timestamps, and any conflicts
 */
export function mergeItemFields<T extends Record<string, any>>(
  local: T,
  remote: T,
  localTimestamps: FieldTimestamps,
  remoteTimestamps: FieldTimestamps,
): MergeResult<T> {
  const allFields = new Set([...Object.keys(local), ...Object.keys(remote)])
  const merged = {} as Record<string, any>
  const mergedTimestamps: FieldTimestamps = {}
  const conflicts: FieldConflict[] = []

  for (const field of allFields) {
    const localTs = localTimestamps[field] ?? 0
    const remoteTs = remoteTimestamps[field] ?? 0
    const localVal = local[field]
    const remoteVal = remote[field]
    const order = compareHLC(localTs, remoteTs)

    if (order < 0) {
      // Remote wins
      merged[field] = remoteVal
      mergedTimestamps[field] = remoteTs
    }
    else if (order > 0) {
      // Local wins
      merged[field] = localVal
      mergedTimestamps[field] = localTs
    }
    else {
      // Same timestamp — check if values differ. With HLC, ties only happen
      // if both sides emitted the same (physical, logical, nodeId), which in
      // practice means the same write; differing values here are a genuine
      // conflict the caller should surface.
      if (!fieldValuesEqual(localVal, remoteVal)) {
        conflicts.push({
          field,
          localValue: localVal,
          remoteValue: remoteVal,
          localTimestamp: localTs,
          remoteTimestamp: remoteTs,
        })
      }
      // Keep local value by default on ties
      merged[field] = localVal
      mergedTimestamps[field] = localTs
    }
  }

  return {
    merged: merged as T,
    mergedTimestamps,
    conflicts,
  }
}

/**
 * Create initial field timestamps for an object.
 *
 * @param data - The object whose fields to timestamp.
 * @param time - Optional explicit timestamp. A bare number is stored as-is
 *   (legacy behaviour). If omitted, a fresh HLC timestamp from the process
 *   default clock is emitted and serialized.
 */
export function createFieldTimestamps(data: Record<string, any>, time?: FieldTimestampValue): FieldTimestamps {
  const resolved = time ?? stringifyHLC(getDefaultClock().now())
  const timestamps: FieldTimestamps = {}
  for (const field of Object.keys(data)) {
    timestamps[field] = resolved
  }
  return timestamps
}

/**
 * Update the timestamps for the specified fields.
 *
 * @param timestamps - Existing field timestamps.
 * @param fields - The fields to update.
 * @param time - Optional explicit timestamp. When omitted a fresh HLC
 *   timestamp is pulled from the process default clock. Providing a raw
 *   `number` preserves legacy wall-clock semantics for opt-out.
 * @returns A new timestamps object with the updated fields.
 */
export function touchFields(
  timestamps: FieldTimestamps,
  fields: string[],
  time?: FieldTimestampValue,
): FieldTimestamps {
  const resolved = time ?? stringifyHLC(getDefaultClock().now())
  const result = { ...timestamps }
  for (const field of fields) {
    result[field] = resolved
  }
  return result
}

/**
 * Compute the fields that changed between two objects.
 * Returns the list of field names whose values are not equal.
 */
export function diffFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
): string[] {
  const changed: string[] = []
  const allFields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const field of allFields) {
    if (!fieldValuesEqual(oldObj[field], newObj[field])) {
      changed.push(field)
    }
  }
  return changed
}

const MAX_DEEP_EQUAL_DEPTH = 32

/**
 * Compare two field values for structural equality.
 *
 * Handles primitives (with `Object.is` so NaN === NaN), `Date` (by `getTime`),
 * `Map`/`Set` (by entries/members), arrays (index-wise, order significant)
 * and plain objects (key order independent). Recursion is capped at
 * `MAX_DEEP_EQUAL_DEPTH` and cycles are tracked to avoid infinite loops.
 */
export function fieldValuesEqual(a: any, b: any): boolean {
  return deepEqual(a, b, new WeakMap(), 0)
}

function deepEqual(a: any, b: any, visited: WeakMap<object, WeakSet<object>>, depth: number): boolean {
  // NaN-aware identity check (Object.is treats NaN as equal).
  if (Object.is(a, b)) {
    return true
  }
  // Treat nullish values as interchangeable for compatibility with prior behavior.
  if (a == null && b == null) {
    return true
  }
  if (a == null || b == null) {
    return false
  }
  if (typeof a !== typeof b) {
    return false
  }
  if (typeof a !== 'object') {
    // Non-object primitives that failed Object.is above are not equal.
    return false
  }
  if (depth > MAX_DEEP_EQUAL_DEPTH) {
    return false
  }

  // Cycle guard: if we're already comparing this exact pair, assume equal so
  // two mirror-shaped cyclic graphs don't loop forever.
  let pairs = visited.get(a as object)
  if (pairs?.has(b as object)) {
    return true
  }
  pairs ??= new WeakSet()
  pairs.add(b as object)
  visited.set(a as object, pairs)

  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) {
      return false
    }
    const aTime = a.getTime()
    const bTime = b.getTime()
    // Both invalid Dates count as equal (NaN === NaN).
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return true
    }
    return aTime === bTime
  }

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray || bIsArray) {
    if (!aIsArray || !bIsArray) {
      return false
    }
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], visited, depth + 1)) {
        return false
      }
    }
    return true
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) {
      return false
    }
    if (a.size !== b.size) {
      return false
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key), visited, depth + 1)) {
        return false
      }
    }
    return true
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) {
      return false
    }
    if (a.size !== b.size) {
      return false
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false
      }
    }
    return true
  }

  // Plain objects — compare by own keys, order independent.
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false
    }
    if (!deepEqual((a as any)[key], (b as any)[key], visited, depth + 1)) {
      return false
    }
  }
  return true
}

/**
 * Compute text changes that transform `source` into `target`.
 * The diff works at character granularity and collapses adjacent edits
 * into replace operations.
 */
export function diffText(source: string, target: string): TextChange[] {
  if (source === target) {
    return []
  }

  const prefixLength = getCommonPrefixLength(source, target)
  const suffixLength = getCommonSuffixLength(source, target, prefixLength)
  const sourceMiddle = source.slice(prefixLength, source.length - suffixLength)
  const targetMiddle = target.slice(prefixLength, target.length - suffixLength)

  if (sourceMiddle.length === 0 || targetMiddle.length === 0) {
    return [{
      index: prefixLength,
      deleteCount: sourceMiddle.length,
      insertText: targetMiddle,
    }]
  }

  if (sourceMiddle.length * targetMiddle.length > MAX_TEXT_DIFF_MATRIX_CELLS) {
    return [{
      index: prefixLength,
      deleteCount: sourceMiddle.length,
      insertText: targetMiddle,
    }]
  }

  const matrix = buildLcsMatrix(sourceMiddle, targetMiddle)
  const changes: TextChange[] = []
  let pending: TextChange | null = null
  let sourceIndex = prefixLength
  let i = 0
  let j = 0

  const ensurePending = () => {
    pending ??= {
      index: sourceIndex,
      deleteCount: 0,
      insertText: '',
    }
    return pending
  }

  const flushPending = () => {
    if (pending && (pending.deleteCount > 0 || pending.insertText.length > 0)) {
      changes.push(pending)
    }
    pending = null
  }

  while (i < sourceMiddle.length || j < targetMiddle.length) {
    if (
      i < sourceMiddle.length
      && j < targetMiddle.length
      && sourceMiddle[i] === targetMiddle[j]
    ) {
      flushPending()
      i++
      j++
      sourceIndex++
      continue
    }

    if (
      i < sourceMiddle.length
      && (
        j === targetMiddle.length
        || matrix[i + 1]![j]! >= matrix[i]![j + 1]!
      )
    ) {
      ensurePending().deleteCount++
      i++
      sourceIndex++
      continue
    }

    if (j < targetMiddle.length) {
      ensurePending().insertText += targetMiddle[j]
      j++
    }
  }

  flushPending()

  return changes
}

/**
 * Apply a list of text changes to a string.
 * Changes are interpreted relative to the original string.
 */
export function applyTextChanges(text: string, changes: TextChange[]): string {
  const orderedChanges = changes
    .map((change, order) => ({ change, order }))
    .sort((a, b) => a.change.index - b.change.index || a.order - b.order)

  let result = text
  for (let i = orderedChanges.length - 1; i >= 0; i--) {
    const { change } = orderedChanges[i]!
    result = result.slice(0, change.index)
      + change.insertText
      + result.slice(change.index + change.deleteCount)
  }
  return result
}

/**
 * Rebase a position through a list of text changes relative to the original
 * string. Positions can either stick to the left or right side of inserted /
 * replaced content.
 */
export function rebaseTextPosition(
  position: number,
  changes: TextChange[],
  affinity: TextPositionAffinity = 'right',
): number {
  const orderedChanges = changes
    .map((change, order) => ({ change, order }))
    .sort((a, b) => a.change.index - b.change.index || a.order - b.order)

  let result = Math.max(0, position)

  for (const { change } of orderedChanges) {
    const start = change.index
    const end = change.index + change.deleteCount
    const insertLength = change.insertText.length
    const replacementEnd = start + insertLength

    if (result < start) {
      continue
    }

    if (result > end) {
      result += insertLength - change.deleteCount
      continue
    }

    if (result === start && change.deleteCount === 0) {
      if (affinity === 'right') {
        result = replacementEnd
      }
      continue
    }

    result = affinity === 'right'
      ? replacementEnd
      : start
  }

  return Math.max(0, result)
}

/**
 * Rebase a text range from `previousText` into `nextText`.
 */
export function rebaseTextRange(
  previousText: string,
  nextText: string,
  range: TextRange,
  options: RebaseTextRangeOptions = {},
): TextRange {
  if (previousText === nextText) {
    return {
      start: clamp(range.start, 0, nextText.length),
      end: clamp(range.end, 0, nextText.length),
    }
  }

  const changes = diffText(previousText, nextText)
  return {
    start: clamp(
      rebaseTextPosition(range.start, changes, options.startAffinity ?? 'right'),
      0,
      nextText.length,
    ),
    end: clamp(
      rebaseTextPosition(range.end, changes, options.endAffinity ?? 'right'),
      0,
      nextText.length,
    ),
  }
}

/**
 * Optional metadata that disambiguates concurrent edits during a merge.
 * When both timestamps are supplied, {@link mergeText} orders concurrent
 * inserts at the same position by HLC instead of falling back to a
 * lexicographic tiebreak.
 */
export interface MergeTextOptions {
  /** HLC timestamp of the local edit (string form or {@link HLCTimestamp}). */
  localTimestamp?: FieldTimestampValue
  /** HLC timestamp of the remote edit (string form or {@link HLCTimestamp}). */
  remoteTimestamp?: FieldTimestampValue
}

/**
 * Merge concurrent text edits made against the same base string.
 * Non-overlapping edits are merged automatically. Overlapping replacements
 * remain conflicts and must be resolved at the field level.
 *
 * For concurrent inserts at the *same position*, ordering depends on the
 * supplied {@link MergeTextOptions}:
 * - With both `localTimestamp` and `remoteTimestamp`: the smaller HLC's
 *   text comes first, so peers that share the same timestamps converge to
 *   the same merge regardless of which side they call "local".
 * - Without both timestamps: fall back to a stable lexicographic tiebreak
 *   (legacy behavior). This still converges, but does not respect the
 *   actual order of writes.
 */
export function mergeText(
  base: string,
  local: string,
  remote: string,
  options: MergeTextOptions = {},
): TextMergeResult {
  const localChanges = diffText(base, local)
  const remoteChanges = diffText(base, remote)

  if (local === remote) {
    return {
      merged: local,
      localChanges,
      remoteChanges,
      conflicts: [],
    }
  }

  if (localChanges.length === 0) {
    return {
      merged: remote,
      localChanges,
      remoteChanges,
      conflicts: [],
    }
  }

  if (remoteChanges.length === 0) {
    return {
      merged: local,
      localChanges,
      remoteChanges,
      conflicts: [],
    }
  }

  const mergedChanges: TextChange[] = []
  const conflicts: TextMergeConflict[] = []
  let localIndex = 0
  let remoteIndex = 0

  while (localIndex < localChanges.length && remoteIndex < remoteChanges.length) {
    const localChange = localChanges[localIndex]!
    const remoteChange = remoteChanges[remoteIndex]!

    if (areSameTextChange(localChange, remoteChange)) {
      mergedChanges.push(localChange)
      localIndex++
      remoteIndex++
      continue
    }

    // Concurrent pure inserts at the exact same position — handle before
    // `compareTextChangeOrder` because it would otherwise pick whichever
    // side is "local" via the `aEnd <= b.index` short-circuit, breaking
    // commutativity across peers.
    if (
      localChange.index === remoteChange.index
      && localChange.deleteCount === 0
      && remoteChange.deleteCount === 0
    ) {
      mergedChanges.push({
        index: localChange.index,
        deleteCount: 0,
        insertText: orderConcurrentInserts(
          localChange.insertText,
          remoteChange.insertText,
          options.localTimestamp,
          options.remoteTimestamp,
        ),
      })
      localIndex++
      remoteIndex++
      continue
    }

    const order = compareTextChangeOrder(localChange, remoteChange)

    if (order < 0) {
      mergedChanges.push(localChange)
      localIndex++
      continue
    }

    if (order > 0) {
      mergedChanges.push(remoteChange)
      remoteIndex++
      continue
    }

    // Overlapping replacements cannot be merged automatically — record the
    // conflict and skip both sides' conflicting change so we can still merge
    // any non-overlapping changes that come after.
    conflicts.push({
      index: Math.min(localChange.index, remoteChange.index),
      localChange,
      remoteChange,
    })
    localIndex++
    remoteIndex++
  }

  // Drain any remaining changes on either side — these are all safe to apply
  // because they occur after the last pair-wise comparison.
  while (localIndex < localChanges.length) {
    mergedChanges.push(localChanges[localIndex]!)
    localIndex++
  }

  while (remoteIndex < remoteChanges.length) {
    mergedChanges.push(remoteChanges[remoteIndex]!)
    remoteIndex++
  }

  return {
    merged: applyTextChanges(base, mergedChanges),
    localChanges,
    remoteChanges,
    conflicts,
  }
}

function getCommonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a[index] === b[index]) {
    index++
  }
  return index
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getCommonSuffixLength(a: string, b: string, prefixLength = 0): number {
  const max = Math.min(a.length, b.length) - prefixLength
  let index = 0
  while (
    index < max
    && a[a.length - 1 - index] === b[b.length - 1 - index]
  ) {
    index++
  }
  return index
}

function buildLcsMatrix(source: string, target: string): Uint32Array[] {
  const matrix = Array.from({ length: source.length + 1 }, () => new Uint32Array(target.length + 1))

  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = target.length - 1; j >= 0; j--) {
      matrix[i]![j] = source[i] === target[j]
        ? matrix[i + 1]![j + 1]! + 1
        : Math.max(matrix[i + 1]![j]!, matrix[i]![j + 1]!)
    }
  }

  return matrix
}

function areSameTextChange(a: TextChange, b: TextChange): boolean {
  return a.index === b.index
    && a.deleteCount === b.deleteCount
    && a.insertText === b.insertText
}

function compareTextChangeOrder(a: TextChange, b: TextChange): number {
  const aEnd = a.index + a.deleteCount
  const bEnd = b.index + b.deleteCount

  if (aEnd <= b.index)
    return -1
  if (bEnd <= a.index)
    return 1

  return 0
}

/**
 * Decide which side's text comes first when two peers concurrently insert
 * at the same position. Uses HLC ordering when both timestamps are present
 * so the merge is causally consistent and commutative across peers; falls
 * back to a stable lexicographic sort otherwise.
 */
function orderConcurrentInserts(
  localText: string,
  remoteText: string,
  localTimestamp: FieldTimestampValue | undefined,
  remoteTimestamp: FieldTimestampValue | undefined,
): string {
  if (localTimestamp != null && remoteTimestamp != null) {
    return compareHLC(localTimestamp, remoteTimestamp) <= 0
      ? `${localText}${remoteText}`
      : `${remoteText}${localText}`
  }
  // Legacy fallback: deterministic but not causally meaningful.
  return [localText, remoteText].sort().join('')
}
