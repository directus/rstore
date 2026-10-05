import type { MultiplayerTextCursor } from '../protocol/types.js'
import { rebaseTextRange } from '../text/rebase.js'

/**
 * Rebase a peer or local cursor over a text change of its field. A caret
 * follows text inserted at its position; a selection grows over text
 * inserted at either edge.
 */
export function rebaseMultiplayerTextCursor(
  cursor: MultiplayerTextCursor,
  previousValue: string,
  nextValue: string,
): MultiplayerTextCursor {
  const range = rebaseTextRange(
    previousValue,
    nextValue,
    cursor,
    cursor.start === cursor.end
      ? {
          startAffinity: 'right',
          endAffinity: 'right',
        }
      : {
          startAffinity: 'left',
          endAffinity: 'right',
        },
  )

  return {
    ...cursor,
    start: range.start,
    end: range.end,
  }
}

/** Whether two (possibly absent) cursors have the same positions and direction. */
export function areMultiplayerTextCursorsEqual(
  left: MultiplayerTextCursor | null | undefined,
  right: MultiplayerTextCursor | null | undefined,
): boolean {
  return left?.start === right?.start
    && left?.end === right?.end
    && left?.direction === right?.direction
}
