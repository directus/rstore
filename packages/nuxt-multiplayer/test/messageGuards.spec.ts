import { describe, expect, it } from 'vitest'
import {
  isMultiplayerMessage,
  isMultiplayerPeerStrict,
  isMultiplayerTextCursor,
  isMultiplayerUser,
  validateMultiplayerMessage,
} from '../src/runtime/utils/messageGuards'

describe('isMultiplayerTextCursor', () => {
  it('accepts canonical cursor', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 0, direction: 'none' })).toBe(true)
    expect(isMultiplayerTextCursor({ start: 1, end: 3, direction: 'forward' })).toBe(true)
  })
  it('rejects start > end', () => {
    expect(isMultiplayerTextCursor({ start: 5, end: 2, direction: 'forward' })).toBe(false)
  })
  it('rejects non-integer positions', () => {
    expect(isMultiplayerTextCursor({ start: 1.5, end: 2, direction: 'forward' })).toBe(false)
  })
  it('rejects NaN / Infinity', () => {
    expect(isMultiplayerTextCursor({ start: Number.NaN, end: 2, direction: 'forward' })).toBe(false)
    expect(isMultiplayerTextCursor({ start: 0, end: Number.POSITIVE_INFINITY, direction: 'forward' })).toBe(false)
  })
  it('rejects out-of-range positions', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 1e8, direction: 'forward' })).toBe(false)
  })
  it('rejects invalid direction', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 0, direction: 'diagonal' })).toBe(false)
  })
})

describe('isMultiplayerUser', () => {
  it('accepts a minimal user', () => {
    expect(isMultiplayerUser({ id: 'u', name: 'A', color: '#abc' })).toBe(true)
  })
  it('rejects missing fields', () => {
    expect(isMultiplayerUser({ id: '', name: 'A', color: '#abc' })).toBe(false)
    expect(isMultiplayerUser({ id: 'u', name: 1, color: '#abc' })).toBe(false)
    expect(isMultiplayerUser(null)).toBe(false)
  })
})

describe('isMultiplayerPeerStrict', () => {
  it('accepts a fully populated peer', () => {
    expect(isMultiplayerPeerStrict({
      id: 'u',
      clientId: 'c',
      name: 'A',
      color: '#abc',
      lastSeen: 100,
      field: 'title',
      cursor: { start: 0, end: 1, direction: 'forward' },
    })).toBe(true)
  })
  it('rejects peer with bad cursor shape', () => {
    expect(isMultiplayerPeerStrict({
      id: 'u',
      clientId: 'c',
      name: 'A',
      color: '#abc',
      lastSeen: 100,
      cursor: { start: 3, end: 1, direction: 'forward' },
    })).toBe(false)
  })
  it('rejects peer with missing lastSeen', () => {
    expect(isMultiplayerPeerStrict({ id: 'u', clientId: 'c', name: 'A', color: '#abc' })).toBe(false)
  })
  it('rejects peer with missing clientId', () => {
    expect(isMultiplayerPeerStrict({ id: 'u', name: 'A', color: '#abc', lastSeen: 100 })).toBe(false)
  })
})

describe('isMultiplayerMessage', () => {
  it('accepts update', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:update',
      roomId: 'r',
      userId: 'u',
      clientId: 'c',
      data: {},
    })).toBe(true)
  })
  it('accepts presence with valid cursor', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'r',
      clientId: 'c',
      user: { id: 'u', name: 'A', color: '#abc' },
      cursor: { start: 0, end: 1, direction: 'forward' },
    })).toBe(true)
  })
  it('accepts leave', () => {
    expect(isMultiplayerMessage({ type: 'multiplayer:leave', roomId: 'r', userId: 'u', clientId: 'c' })).toBe(true)
  })
  it('rejects unknown type', () => {
    expect(isMultiplayerMessage({ type: 'multiplayer:dance', roomId: 'r', clientId: 'c' })).toBe(false)
  })
  it('rejects missing userId on update', () => {
    expect(isMultiplayerMessage({ type: 'multiplayer:update', roomId: 'r', clientId: 'c', data: {} })).toBe(false)
  })
  it('rejects missing clientId', () => {
    expect(isMultiplayerMessage({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' })).toBe(false)
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
})

describe('validateMultiplayerMessage', () => {
  it('returns typed message from valid JSON', () => {
    const out = validateMultiplayerMessage(JSON.stringify({
      type: 'multiplayer:leave',
      roomId: 'r',
      userId: 'u',
      clientId: 'c',
    }))
    expect(out?.type).toBe('multiplayer:leave')
  })
  it('returns null on malformed JSON', () => {
    expect(validateMultiplayerMessage('{bad')).toBeNull()
  })
  it('returns null on non-string input', () => {
    expect(validateMultiplayerMessage(42)).toBeNull()
  })
  it('returns null when structural validation fails', () => {
    expect(validateMultiplayerMessage(JSON.stringify({ type: 'wrong' }))).toBeNull()
  })
})
