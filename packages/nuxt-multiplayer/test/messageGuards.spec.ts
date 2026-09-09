import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isMultiplayerPeerStrict, validateMultiplayerMessage } from '../src/runtime/utils/messageGuards'

describe('isMultiplayerPeerStrict', () => {
  it('accepts a fully populated peer', () => {
    expect(isMultiplayerPeerStrict({
      id: 'user',
      clientId: 'tab',
      name: 'Ada',
      color: '#123',
      lastSeen: 100,
      field: 'title',
      cursor: { start: 0, end: 1, direction: 'forward' },
    })).toBe(true)
  })

  it('rejects client-only peer fields that cannot be trusted', () => {
    expect(isMultiplayerPeerStrict({
      id: 'user',
      clientId: 'tab',
      name: 'Ada',
      color: '#123',
      lastSeen: 100,
      cursor: { start: 3, end: 1, direction: 'forward' },
    })).toBe(false)
    expect(isMultiplayerPeerStrict({ id: 'user', clientId: 'tab', name: 'Ada', color: '#123' })).toBe(false)
    expect(isMultiplayerPeerStrict({ id: 'user', name: 'Ada', color: '#123', lastSeen: 100 })).toBe(false)
    expect(isMultiplayerPeerStrict({
      id: 'user',
      clientId: 'x'.repeat(129),
      name: 'Ada',
      color: '#123',
      lastSeen: 100,
    })).toBe(false)
  })
})

describe('validateMultiplayerMessage', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns a typed message from valid JSON', () => {
    const out = validateMultiplayerMessage(JSON.stringify({
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'user',
      clientId: 'tab',
    }))

    expect(out?.type).toBe('multiplayer:leave')
  })

  it('does not warn for invalid input outside development structural validation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(validateMultiplayerMessage(42)).toBeNull()
    expect(validateMultiplayerMessage('{invalid')).toBeNull()
    expect(validateMultiplayerMessage(JSON.stringify({ type: 'unknown' }))).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when a JSON frame fails structural validation in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidFrame = { type: 'unknown' }

    expect(validateMultiplayerMessage(JSON.stringify(invalidFrame))).toBeNull()
    expect(warn).toHaveBeenCalledWith('[rstore-multiplayer] Dropped invalid message:', invalidFrame)
  })
})
