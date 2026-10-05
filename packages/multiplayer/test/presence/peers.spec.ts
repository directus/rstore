import { isMultiplayerPeerStrict } from '@rstore/multiplayer/presence'
import { describe, expect, it } from 'vitest'

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
