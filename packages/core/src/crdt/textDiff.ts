import type { TextChange } from './types.js'

const MAX_TEXT_DIFF_MATRIX_CELLS = 4_000_000

/**
 * Compute text changes that transform `source` into `target`.
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
    return [{ index: prefixLength, deleteCount: sourceMiddle.length, insertText: targetMiddle }]
  }
  if (sourceMiddle.length * targetMiddle.length > MAX_TEXT_DIFF_MATRIX_CELLS) {
    return [{ index: prefixLength, deleteCount: sourceMiddle.length, insertText: targetMiddle }]
  }

  const matrix = buildLcsMatrix(sourceMiddle, targetMiddle)
  const changes: TextChange[] = []
  let pending: TextChange | null = null
  let sourceIndex = prefixLength
  let i = 0
  let j = 0

  const ensurePending = () => {
    pending ??= { index: sourceIndex, deleteCount: 0, insertText: '' }
    return pending
  }
  const flushPending = () => {
    if (pending && (pending.deleteCount > 0 || pending.insertText.length > 0)) {
      changes.push(pending)
    }
    pending = null
  }

  while (i < sourceMiddle.length || j < targetMiddle.length) {
    if (i < sourceMiddle.length && j < targetMiddle.length && sourceMiddle[i] === targetMiddle[j]) {
      flushPending()
      i++
      j++
      sourceIndex++
      continue
    }
    if (i < sourceMiddle.length && (j === targetMiddle.length || matrix[i + 1]![j]! >= matrix[i]![j + 1]!)) {
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
 * Apply text changes relative to the original string.
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
 * Count identical characters from the start of two strings.
 */
function getCommonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a[index] === b[index]) {
    index++
  }
  return index
}

/**
 * Count identical characters from the end of two strings.
 */
function getCommonSuffixLength(a: string, b: string, prefixLength = 0): number {
  const max = Math.min(a.length, b.length) - prefixLength
  let index = 0
  while (index < max && a[a.length - 1 - index] === b[b.length - 1 - index]) {
    index++
  }
  return index
}

/**
 * Build an LCS matrix for the changed middle slice.
 */
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
