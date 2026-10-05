import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAliceChannel, leaveFrame, presenceFrame } from './harness'

beforeEach(() => {
  vi.useFakeTimers({ now: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createPresenceChannel heartbeat', () => {
  it('sends presence every heartbeatMs while open, and on reopen', () => {
    const { channel, sentOfType, setOpen } = createAliceChannel({ heartbeatMs: 1000 })

    vi.advanceTimersByTime(3000)
    expect(sentOfType('multiplayer:presence')).toHaveLength(3)

    setOpen(false)
    vi.advanceTimersByTime(2000)
    expect(sentOfType('multiplayer:presence')).toHaveLength(3)

    setOpen(true)
    channel.handleOpen()
    expect(sentOfType('multiplayer:presence')).toHaveLength(4)
    vi.advanceTimersByTime(1000)
    expect(sentOfType('multiplayer:presence')).toHaveLength(5)

    channel.dispose()
  })

  it('stamps frames with the user and the connection clientId', () => {
    const { channel, sent } = createAliceChannel()

    channel.join()
    channel.sendUpdate({ title: 'x' })

    expect(sent).toEqual([
      { type: 'multiplayer:presence', roomId: 'room', clientId: 'c-alice', user: { id: 'alice', name: 'Alice', color: '#f00' }, field: null, cursor: null },
      { type: 'multiplayer:update', roomId: 'room', clientId: 'c-alice', userId: 'alice', data: { title: 'x' } },
    ])
    channel.dispose()
  })

  it('sends a leave and stops the heartbeat on dispose', () => {
    const { channel, sent, sentOfType } = createAliceChannel({ heartbeatMs: 1000 })

    channel.dispose()
    vi.advanceTimersByTime(5000)

    expect(sent).toEqual([{ type: 'multiplayer:leave', roomId: 'room', userId: 'alice', clientId: 'c-alice' }])
    expect(sentOfType('multiplayer:presence')).toEqual([])
  })
})

describe('createPresenceChannel peers', () => {
  it('evicts a peer after staleMs without frames, and keeps one that heartbeats', () => {
    const { channel, receive } = createAliceChannel({ staleMs: 15_000 })

    receive(presenceFrame('bob', 'c-bob'))
    receive(presenceFrame('carol', 'c-carol'))
    vi.advanceTimersByTime(10_000)
    // Identical heartbeat payload: still refreshes the peer.
    receive(presenceFrame('bob', 'c-bob'))
    vi.advanceTimersByTime(10_000)

    expect(channel.getState().peers.map(peer => peer.clientId)).toEqual(['c-bob'])

    vi.advanceTimersByTime(20_000)
    expect(channel.getState().peers).toEqual([])
    channel.dispose()
  })

  it('removes a peer immediately on leave, only for that connection', () => {
    const { channel, receive } = createAliceChannel()

    receive(presenceFrame('bob', 'c-tab-1'))
    receive(presenceFrame('bob', 'c-tab-2'))
    receive(leaveFrame('bob', 'c-tab-1'))

    expect(channel.getState().peers.map(peer => peer.clientId)).toEqual(['c-tab-2'])
    channel.dispose()
  })

  it('filters self-echo by clientId, so two tabs of the same user both appear', () => {
    const { channel, receive } = createAliceChannel()

    receive(presenceFrame('alice', 'c-alice'))
    receive(presenceFrame('alice', 'c-other-tab'))

    expect(channel.getState().peers.map(peer => [peer.id, peer.clientId])).toEqual([['alice', 'c-other-tab']])
    channel.dispose()
  })

  it('delivers updates from other connections only, including the same user\'s other tab', () => {
    const { channel, receive } = createAliceChannel()
    const updates: unknown[] = []
    channel.onUpdate(update => updates.push(update))

    receive({ type: 'multiplayer:update', roomId: 'room', userId: 'alice', clientId: 'c-other-tab', data: { title: 'other tab' } })
    receive({ type: 'multiplayer:update', roomId: 'room', userId: 'alice', clientId: 'c-alice', data: { title: 'echo' } })
    receive({ type: 'multiplayer:update', roomId: 'elsewhere', userId: 'bob', clientId: 'c-bob', data: { title: 'other room' } })

    expect(updates).toEqual([{ title: 'other tab' }])
    channel.dispose()
  })

  it('ignores invalid frames and reports them through onInvalidMessage', () => {
    const invalid: unknown[] = []
    const { channel, receive } = createAliceChannel({ onInvalidMessage: value => invalid.push(value) })

    receive({ type: 'multiplayer:presence', roomId: 'room', clientId: 'c-bob', user: { id: '' } })
    channel.receive('{not json')

    expect(channel.getState().peers).toEqual([])
    expect(invalid).toEqual([{ type: 'multiplayer:presence', roomId: 'room', clientId: 'c-bob', user: { id: '' } }])
    channel.dispose()
  })

  it('notifies subscribers with the new state', () => {
    const { channel, receive } = createAliceChannel()
    const seen: string[][] = []
    const unsubscribe = channel.subscribe(state => seen.push(state.peers.map(peer => peer.clientId)))

    receive(presenceFrame('bob', 'c-bob'))
    unsubscribe()
    receive(presenceFrame('carol', 'c-carol'))

    expect(seen).toEqual([['c-bob']])
    channel.dispose()
  })
})

describe('createPresenceChannel per-user aggregation', () => {
  it('picks the most recently seen connection of each user', () => {
    const { channel, receive } = createAliceChannel()

    receive(presenceFrame('bob', 'c-tab-1', { field: 'title' }))
    vi.advanceTimersByTime(1000)
    receive(presenceFrame('bob', 'c-tab-2', { field: 'body' }))
    receive(presenceFrame('carol', 'c-carol'))
    expect(channel.getState().users.map(user => [user.id, user.field])).toEqual([['bob', 'body'], ['carol', null]])

    vi.advanceTimersByTime(1000)
    receive(presenceFrame('bob', 'c-tab-1', { field: 'title' }))
    expect(channel.getState().users.find(user => user.id === 'bob')?.clientId).toBe('c-tab-1')
    channel.dispose()
  })
})

describe('createPresenceChannel cursor rebase', () => {
  it('rebases the local cursor and re-sends presence when the field text changes', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.setTextCursor('body', { start: 2, end: 2, direction: 'none' })
    channel.rebaseTextCursor('body', 'hello', 'XXhello')

    expect(sentOfType('multiplayer:presence').at(-1)).toMatchObject({ field: 'body', cursor: { start: 4, end: 4, direction: 'none' } })
    channel.dispose()
  })

  it('does not re-send presence when the local cursor is unaffected', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.setTextCursor('body', { start: 2, end: 2, direction: 'none' })
    channel.rebaseTextCursor('body', 'hello', 'hello!')
    channel.rebaseTextCursor('title', 'hello', 'XXhello')

    expect(sentOfType('multiplayer:presence')).toHaveLength(1)
    channel.dispose()
  })

  it('rebases peer cursors on the changed field only', () => {
    const { channel, receive } = createAliceChannel()
    receive(presenceFrame('bob', 'c-bob', { field: 'body', cursor: { start: 1, end: 3, direction: 'forward' } }))
    receive(presenceFrame('carol', 'c-carol', { field: 'title', cursor: { start: 1, end: 1, direction: 'none' } }))

    channel.rebaseTextCursor('body', 'hello', 'XXhello')

    expect(channel.getState().peers.map(peer => peer.cursor)).toEqual([
      { start: 3, end: 5, direction: 'forward' },
      { start: 1, end: 1, direction: 'none' },
    ])
    channel.dispose()
  })
})

describe('createPresenceChannel focus', () => {
  it('ignores a stale blur of a field that already lost the focus', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.setFocusedField('title')
    channel.setFocusedField('body')
    channel.clearFocus('title')
    expect(sentOfType('multiplayer:presence').map(frame => frame.field)).toEqual(['title', 'body'])

    channel.clearFocus('body')
    expect(sentOfType('multiplayer:presence').map(frame => frame.field)).toEqual(['title', 'body', null])
    channel.dispose()
  })

  it('drops the cursor when the focus moves to another field or is cleared', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.setTextCursor('body', { start: 1, end: 1, direction: 'none' })
    channel.setFocusedField('title')
    channel.clearFocus()

    expect(sentOfType('multiplayer:presence').map(frame => [frame.field, frame.cursor])).toEqual([
      ['body', { start: 1, end: 1, direction: 'none' }],
      ['title', null],
      [null, null],
    ])
    channel.dispose()
  })
})
