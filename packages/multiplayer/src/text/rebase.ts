import type { RebaseTextRangeOptions, TextChange, TextPositionAffinity, TextRange } from './types.js'
import { diffText } from './diff.js'

/**
 * Map a position in the original text through changes relative to it.
 *
 * A position inside a replaced span, or at an insert, moves to the end of
 * the replacement with `'right'` affinity (the default) and to its start with
 * `'left'` affinity. Positions are UTF-16 code units.
 *
 * @param position Offset in the original text.
 * @param changes Changes relative to the original text (any order).
 * @param affinity Side of inserted/replaced text the position sticks to.
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
 * Map a selection from `previousText` into `nextText` (a remote edit arrived).
 *
 * The change set is computed with `diffText`, so the result is a best-effort
 * mapping for state-based updates; sequenced ops should map positions through
 * their own changes with `rebaseTextPosition`. The result is clamped to
 * `nextText`.
 *
 * @param previousText Text the range refers to.
 * @param nextText Text to map the range into.
 * @param range Selection offsets in `previousText`.
 * @param options Affinity of each end (both default to `'right'`).
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
