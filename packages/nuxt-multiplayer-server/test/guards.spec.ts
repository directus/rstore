import { describe, expect, it } from 'vitest'
import {
  isMultiplayerId,
  isMultiplayerMessage,
  isMultiplayerTextCursor,
  parseMultiplayerMessage,
} from '../src/runtime/server/guards'

describe('server multiplayer guard facade', () => {
  it('keeps Shared validation available through the server entrypoint', () => {
    expect(isMultiplayerId('x'.repeat(129))).toBe(false)
    expect(isMultiplayerTextCursor({ start: 2, end: 1, direction: 'forward' })).toBe(false)
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'tab',
      user: { id: 'user', name: 'Ada', color: '#123' },
    })).toBe(true)
  })

  it('keeps the server parse entrypoint compatible', () => {
    const message = parseMultiplayerMessage(JSON.stringify({
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'user',
      clientId: 'tab',
    }))

    expect(message?.type).toBe('multiplayer:leave')
    expect(parseMultiplayerMessage('{invalid')).toBeNull()
  })
})
