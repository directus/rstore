import { describe, expect, it } from 'vitest'
import { isMultiplayerMessage, isMultiplayerTextCursor, parseMultiplayerMessage } from '../src/runtime/server/guards'

describe('isMultiplayerTextCursor', () => {
  it('accepts valid cursor', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 3, direction: 'forward' })).toBe(true)
  })
  it('rejects start > end', () => {
    expect(isMultiplayerTextCursor({ start: 5, end: 2, direction: 'forward' })).toBe(false)
  })
  it('rejects NaN / negative / non-int', () => {
    expect(isMultiplayerTextCursor({ start: -1, end: 2, direction: 'forward' })).toBe(false)
    expect(isMultiplayerTextCursor({ start: 1.5, end: 2, direction: 'forward' })).toBe(false)
    expect(isMultiplayerTextCursor({ start: Number.NaN, end: 2, direction: 'forward' })).toBe(false)
  })
  it('rejects unknown direction', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 0, direction: 'sideways' })).toBe(false)
  })
})

describe('isMultiplayerMessage', () => {
  it('accepts presence with user', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'r',
      clientId: 'c',
      user: { id: 'u', name: 'N', color: '#fff' },
    })).toBe(true)
  })
  it('rejects presence with bad cursor', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'r',
      clientId: 'c',
      user: { id: 'u', name: 'N', color: '#fff' },
      cursor: { start: 3, end: 1, direction: 'forward' },
    })).toBe(false)
  })
  it('accepts update', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:update',
      roomId: 'r',
      userId: 'u',
      clientId: 'c',
      data: { foo: 1 },
    })).toBe(true)
  })
  it('rejects unknown type', () => {
    expect(isMultiplayerMessage({ type: 'other', roomId: 'r', clientId: 'c' })).toBe(false)
  })
  it('rejects frames without clientId', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:leave',
      roomId: 'r',
      userId: 'u',
    })).toBe(false)
  })
  it('rejects update whose data is not a plain object', () => {
    for (const data of [null, [], 'string', 42, true]) {
      expect(isMultiplayerMessage({
        type: 'multiplayer:update',
        roomId: 'r',
        userId: 'u',
        clientId: 'c',
        data,
      })).toBe(false)
    }
  })
  it('rejects update with missing data', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:update',
      roomId: 'r',
      userId: 'u',
      clientId: 'c',
    })).toBe(false)
  })
  it('rejects oversized ids', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:leave',
      roomId: 'r',
      userId: 'u'.repeat(200),
      clientId: 'c',
    })).toBe(false)
  })
})

describe('parseMultiplayerMessage', () => {
  it('returns null on non-JSON', () => {
    expect(parseMultiplayerMessage('{not-json')).toBeNull()
    expect(parseMultiplayerMessage(42 as unknown)).toBeNull()
  })
  it('parses valid frames', () => {
    const out = parseMultiplayerMessage(JSON.stringify({
      type: 'multiplayer:leave',
      roomId: 'r',
      userId: 'u',
      clientId: 'c',
    }))
    expect(out?.type).toBe('multiplayer:leave')
  })
})
