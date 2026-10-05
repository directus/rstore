import type { MultiplayerTextCursor } from '../types'

/** Map a DOM `selectionDirection` to the wire cursor direction. */
export function normalizeSelectionDirection(direction: string | null): MultiplayerTextCursor['direction'] {
  if (direction === 'forward' || direction === 'backward') {
    return direction
  }

  return 'none'
}

/** Read the selection of a text input as a wire cursor. */
export function readTextCursor(target: HTMLInputElement | HTMLTextAreaElement): MultiplayerTextCursor {
  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start

  return {
    start,
    end,
    direction: normalizeSelectionDirection(target.selectionDirection),
  }
}
