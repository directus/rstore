import type { MultiplayerTextCursor } from '../types'
import { rebaseTextRange } from '@rstore/core'

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

export function areMultiplayerTextCursorsEqual(
  left: MultiplayerTextCursor | null | undefined,
  right: MultiplayerTextCursor | null | undefined,
): boolean {
  return left?.start === right?.start
    && left?.end === right?.end
    && left?.direction === right?.direction
}
