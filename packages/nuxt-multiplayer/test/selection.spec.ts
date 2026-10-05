import { describe, expect, it } from 'vitest'
import { readTextCursor } from '../src/runtime/utils/selection'

/** The selection surface of an input element. */
function input(selectionStart: number | null, selectionEnd: number | null, selectionDirection: string | null) {
  return { selectionStart, selectionEnd, selectionDirection } as HTMLInputElement
}

describe('readTextCursor', () => {
  it('reads the selection with its direction', () => {
    expect(readTextCursor(input(1, 3, 'backward'))).toEqual({ start: 1, end: 3, direction: 'backward' })
    expect(readTextCursor(input(2, 2, 'forward'))).toEqual({ start: 2, end: 2, direction: 'forward' })
  })

  it('falls back to a collapsed cursor without direction', () => {
    expect(readTextCursor(input(4, null, null))).toEqual({ start: 4, end: 4, direction: 'none' })
    expect(readTextCursor(input(null, null, 'sideways'))).toEqual({ start: 0, end: 0, direction: 'none' })
  })
})
