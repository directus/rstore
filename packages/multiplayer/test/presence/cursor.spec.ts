import { areMultiplayerTextCursorsEqual, rebaseMultiplayerTextCursor } from '@rstore/multiplayer/presence'
import { describe, expect, it } from 'vitest'

describe('rebaseMultiplayerTextCursor', () => {
  it('moves a caret after text inserted at its position', () => {
    expect(rebaseMultiplayerTextCursor({ start: 2, end: 2, direction: 'none' }, 'hello', 'heXXllo'))
      .toEqual({ start: 4, end: 4, direction: 'none' })
  })

  it('grows a selection over text inserted at its edges', () => {
    expect(rebaseMultiplayerTextCursor({ start: 2, end: 4, direction: 'backward' }, 'hello', 'heXXllo'))
      .toEqual({ start: 2, end: 6, direction: 'backward' })
    expect(rebaseMultiplayerTextCursor({ start: 2, end: 4, direction: 'forward' }, 'hello', 'hellXXo'))
      .toEqual({ start: 2, end: 6, direction: 'forward' })
  })
})

describe('areMultiplayerTextCursorsEqual', () => {
  it('compares positions and direction', () => {
    expect(areMultiplayerTextCursorsEqual({ start: 1, end: 2, direction: 'forward' }, { start: 1, end: 2, direction: 'forward' })).toBe(true)
    expect(areMultiplayerTextCursorsEqual({ start: 1, end: 2, direction: 'forward' }, { start: 1, end: 2, direction: 'backward' })).toBe(false)
    expect(areMultiplayerTextCursorsEqual(null, undefined)).toBe(true)
    expect(areMultiplayerTextCursorsEqual(null, { start: 0, end: 0, direction: 'none' })).toBe(false)
  })
})
