import type { RebaseTextRangeOptions, TextChange, TextPositionAffinity, TextRange } from './types.js'
import { diffText } from './textDiff.js'

/**
 * Rebase a position through text changes relative to the original string.
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
    result = affinity === 'right' ? replacementEnd : start
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
    start: clamp(rebaseTextPosition(range.start, changes, options.startAffinity ?? 'right'), 0, nextText.length),
    end: clamp(rebaseTextPosition(range.end, changes, options.endAffinity ?? 'right'), 0, nextText.length),
  }
}

/**
 * Clamp a number to an inclusive range.
 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
