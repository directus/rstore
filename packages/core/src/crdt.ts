/**
 * Field-level timestamps for Last-Writer-Wins (LWW) register.
 * Maps field names to the timestamp of their last modification.
 */
export type FieldTimestamps = Record<string, number>

/**
 * Describes a conflict on a single field where both local and remote
 * have different values at the same or overlapping timestamp.
 */
export interface FieldConflict {
  field: string
  localValue: any
  remoteValue: any
  localTimestamp: number
  remoteTimestamp: number
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

    if (remoteTs > localTs) {
      // Remote wins
      merged[field] = remoteVal
      mergedTimestamps[field] = remoteTs
    }
    else if (localTs > remoteTs) {
      // Local wins
      merged[field] = localVal
      mergedTimestamps[field] = localTs
    }
    else {
      // Same timestamp — check if values differ
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
 * Create initial field timestamps for an object, setting all fields to the given time.
 *
 * @param data - The object whose fields to timestamp
 * @param time - The timestamp to assign (defaults to `Date.now()`)
 */
export function createFieldTimestamps(data: Record<string, any>, time = Date.now()): FieldTimestamps {
  const timestamps: FieldTimestamps = {}
  for (const field of Object.keys(data)) {
    timestamps[field] = time
  }
  return timestamps
}

/**
 * Update the timestamps for the specified fields.
 *
 * @param timestamps - Existing field timestamps
 * @param fields - The fields to update
 * @param time - The timestamp to set (defaults to `Date.now()`)
 * @returns A new timestamps object with the updated fields
 */
export function touchFields(
  timestamps: FieldTimestamps,
  fields: string[],
  time = Date.now(),
): FieldTimestamps {
  const result = { ...timestamps }
  for (const field of fields) {
    result[field] = time
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

/**
 * Compare two field values for equality.
 * Handles primitives by strict equality and arrays/objects by JSON comparison.
 */
export function fieldValuesEqual(a: any, b: any): boolean {
  if (a === b)
    return true
  if (a == null && b == null)
    return true
  if (a == null || b == null)
    return false
  if (typeof a !== typeof b)
    return false
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    }
    catch {
      return false
    }
  }
  return false
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
 * Merge concurrent text edits made against the same base string.
 * Non-overlapping edits are merged automatically. Overlapping replacements
 * remain conflicts and must be resolved at the field level.
 */
export function mergeText(base: string, local: string, remote: string): TextMergeResult {
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

    if (localChange.index === remoteChange.index && localChange.deleteCount === 0 && remoteChange.deleteCount === 0) {
      mergedChanges.push({
        index: localChange.index,
        deleteCount: 0,
        insertText: [localChange.insertText, remoteChange.insertText].sort().join(''),
      })
      localIndex++
      remoteIndex++
      continue
    }

    conflicts.push({
      index: Math.min(localChange.index, remoteChange.index),
      localChange,
      remoteChange,
    })
    break
  }

  while (conflicts.length === 0 && localIndex < localChanges.length) {
    mergedChanges.push(localChanges[localIndex]!)
    localIndex++
  }

  while (conflicts.length === 0 && remoteIndex < remoteChanges.length) {
    mergedChanges.push(remoteChanges[remoteIndex]!)
    remoteIndex++
  }

  return {
    merged: conflicts.length === 0 ? applyTextChanges(base, mergedChanges) : local,
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
