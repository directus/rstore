import type { FieldTimestampValue } from '../hlc/index.js'
import type { MergeTextOptions, TextChange, TextMergeConflict, TextMergeResult } from './types.js'
import { compareHLC } from '../hlc/index.js'
import { applyTextChanges, diffText } from './textDiff.js'

/**
 * Merge concurrent text edits made against the same base string.
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
    return { merged: local, localChanges, remoteChanges, conflicts: [] }
  }
  if (localChanges.length === 0) {
    return { merged: remote, localChanges, remoteChanges, conflicts: [] }
  }
  if (remoteChanges.length === 0) {
    return { merged: local, localChanges, remoteChanges, conflicts: [] }
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

    if (localChange.index === remoteChange.index && localChange.deleteCount === 0 && remoteChange.deleteCount === 0) {
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

    conflicts.push({
      index: Math.min(localChange.index, remoteChange.index),
      localChange,
      remoteChange,
    })
    localIndex++
    remoteIndex++
  }

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

/**
 * Check whether two text changes are identical.
 */
function areSameTextChange(a: TextChange, b: TextChange): boolean {
  return a.index === b.index && a.deleteCount === b.deleteCount && a.insertText === b.insertText
}

/**
 * Order two text changes, returning zero when they overlap.
 */
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
 * Order same-position concurrent inserts using HLC when available.
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
  return [localText, remoteText].sort().join('')
}
