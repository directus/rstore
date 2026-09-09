import { describe, expect, it } from 'vitest'
import {
  isMultiplayerId,
  isMultiplayerMessage,
  isMultiplayerTextCursor,
  isMultiplayerUser,
  parseMultiplayerMessage,
} from '../../src'

describe('multiplayer protocol guards', () => {
  it('accepts bounded multiplayer ids only', () => {
    expect(isMultiplayerId('user')).toBe(true)
    expect(isMultiplayerId('x'.repeat(128))).toBe(true)
    expect(isMultiplayerId('')).toBe(false)
    expect(isMultiplayerId('x'.repeat(129))).toBe(false)
    expect(isMultiplayerId(1)).toBe(false)
  })

  it('accepts canonical cursors and rejects malformed positions', () => {
    expect(isMultiplayerTextCursor({ start: 0, end: 0, direction: 'none' })).toBe(true)
    expect(isMultiplayerTextCursor({ start: 1, end: 3, direction: 'forward' })).toBe(true)
    expect(isMultiplayerTextCursor({ start: 1e7, end: 1e7, direction: 'backward' })).toBe(true)

    for (const cursor of [
      { start: 3, end: 1, direction: 'forward' },
      { start: -1, end: 1, direction: 'forward' },
      { start: 0.5, end: 1, direction: 'forward' },
      { start: Number.NaN, end: 1, direction: 'forward' },
      { start: 0, end: Number.POSITIVE_INFINITY, direction: 'forward' },
      { start: 0, end: 1e8, direction: 'forward' },
      { start: 0, end: 1, direction: 'sideways' },
    ]) {
      expect(isMultiplayerTextCursor(cursor)).toBe(false)
    }
  })

  it.each([
    ['an empty id', { id: '', name: 'Ada', color: '#123' }],
    ['a missing name', { id: 'user', color: '#123' }],
    ['a missing color', { id: 'user', name: 'Ada' }],
    ['a non-string name', { id: 'user', name: 1, color: '#123' }],
    ['a non-record value', null],
  ])('rejects a user with %s', (_description, value) => {
    expect(isMultiplayerUser({ id: 'user', name: 'Ada', color: '#123' })).toBe(true)
    expect(isMultiplayerUser(value)).toBe(false)
  })

  it('accepts every valid message variant', () => {
    expect(isMultiplayerMessage({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'user',
      clientId: 'tab',
      data: { title: 'Updated' },
    })).toBe(true)
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'tab',
      user: { id: 'user', name: 'Ada', color: '#123' },
      field: 'title',
      cursor: { start: 0, end: 3, direction: 'backward' },
    })).toBe(true)
    expect(isMultiplayerMessage({
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'tab',
      user: { id: 'user', name: 'Ada', color: '#123' },
      field: null,
      cursor: null,
    })).toBe(true)
    expect(isMultiplayerMessage({
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'user',
      clientId: 'tab',
    })).toBe(true)
  })

  const invalidMessageCases: Array<[string, unknown]> = [
    ['a non-record frame', null],
    ['an array frame', []],
    ['an unknown type', { type: 'multiplayer:unknown', roomId: 'room', clientId: 'tab' }],
    ['a non-string room id', { type: 'multiplayer:leave', roomId: 1, userId: 'user', clientId: 'tab' }],
    ['an empty update client id', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: '', data: {} }],
    ['an oversized update client id', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: 'x'.repeat(129), data: {} }],
    ['an oversized presence client id', { type: 'multiplayer:presence', roomId: 'room', clientId: 'x'.repeat(129), user: { id: 'user', name: 'Ada', color: '#123' } }],
    ['an oversized leave client id', { type: 'multiplayer:leave', roomId: 'room', userId: 'user', clientId: 'x'.repeat(129) }],
    ['a missing update user id', { type: 'multiplayer:update', roomId: 'room', clientId: 'tab', data: {} }],
    ['an oversized update user id', { type: 'multiplayer:update', roomId: 'room', userId: 'x'.repeat(129), clientId: 'tab', data: {} }],
    ['missing update data', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: 'tab' }],
    ['a null update payload', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: 'tab', data: null }],
    ['an array update payload', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: 'tab', data: [] }],
    ['a primitive update payload', { type: 'multiplayer:update', roomId: 'room', userId: 'user', clientId: 'tab', data: true }],
    ['a presence user with an oversized id', { type: 'multiplayer:presence', roomId: 'room', clientId: 'tab', user: { id: 'x'.repeat(129), name: 'Ada', color: '#123' } }],
    ['a presence user without a name', { type: 'multiplayer:presence', roomId: 'room', clientId: 'tab', user: { id: 'user', color: '#123' } }],
    ['a non-string presence field', { type: 'multiplayer:presence', roomId: 'room', clientId: 'tab', user: { id: 'user', name: 'Ada', color: '#123' }, field: 1 }],
    ['an invalid presence cursor', { type: 'multiplayer:presence', roomId: 'room', clientId: 'tab', user: { id: 'user', name: 'Ada', color: '#123' }, cursor: { start: 2, end: 1, direction: 'forward' } }],
    ['a missing leave user id', { type: 'multiplayer:leave', roomId: 'room', clientId: 'tab' }],
    ['an oversized leave user id', { type: 'multiplayer:leave', roomId: 'room', userId: 'x'.repeat(129), clientId: 'tab' }],
  ]

  it.each(invalidMessageCases)('rejects %s', (_description, message) => {
    expect(isMultiplayerMessage(message)).toBe(false)
  })

  it('parses valid JSON frames and rejects invalid raw payloads', () => {
    const validLeave = JSON.stringify({
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'user',
      clientId: 'tab',
    })

    expect(parseMultiplayerMessage(validLeave)?.type).toBe('multiplayer:leave')
    expect(parseMultiplayerMessage('{invalid')).toBeNull()
    expect(parseMultiplayerMessage(JSON.stringify({ type: 'unknown' }))).toBeNull()
    expect(parseMultiplayerMessage(42)).toBeNull()
  })
})
