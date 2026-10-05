import { isMultiplayerMessage, parseMultiplayerMessage } from '@rstore/multiplayer/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAliceChannel, leaveFrame, presenceFrame, typingFrame } from './harness'

const target = { collection: 'todos', key: 1, field: 'title' }

beforeEach(() => {
  vi.useFakeTimers({ now: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('presence typing indicators', () => {
  it('sends a content-free typing frame, at most once per throttle window', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.notifyTyping(target)
    vi.advanceTimersByTime(500)
    channel.notifyTyping(target)
    vi.advanceTimersByTime(600)
    channel.notifyTyping(target)

    expect(sentOfType('multiplayer:typing')).toEqual([
      { type: 'multiplayer:typing', roomId: 'room', clientId: 'c-alice', userId: 'alice', target },
      { type: 'multiplayer:typing', roomId: 'room', clientId: 'c-alice', userId: 'alice', target },
    ])
    channel.dispose()
  })

  it('sends the new target at once when it changes', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.notifyTyping(target)
    channel.notifyTyping({ collection: 'todos', key: 2 })

    expect(sentOfType('multiplayer:typing').map(frame => frame.target)).toEqual([target, { collection: 'todos', key: 2 }])
    channel.dispose()
  })

  it('clears the local typing state on blur, unless it already expired', () => {
    const { channel, sentOfType } = createAliceChannel()

    channel.notifyTyping(target)
    channel.clearFocus()
    expect(sentOfType('multiplayer:typing').at(-1)?.target).toBeNull()

    channel.notifyTyping(target)
    vi.advanceTimersByTime(3000)
    channel.clearFocus()
    expect(sentOfType('multiplayer:typing').map(frame => frame.target)).toEqual([target, null, target])
    channel.dispose()
  })

  it('shows a remote peer typing until 3 s after its last frame', () => {
    const { channel, receive } = createAliceChannel()

    receive(typingFrame('bob', 'c-bob', target))
    expect(channel.getState().typing).toEqual([{ clientId: 'c-bob', userId: 'bob', target }])

    vi.advanceTimersByTime(2000)
    receive(typingFrame('bob', 'c-bob', target))
    vi.advanceTimersByTime(2999)
    expect(channel.getState().typing).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(channel.getState().typing).toEqual([])
    channel.dispose()
  })

  it('clears a remote peer typing on its blur and on its leave', () => {
    const { channel, receive } = createAliceChannel()
    receive(presenceFrame('bob', 'c-bob'))
    receive(presenceFrame('carol', 'c-carol'))

    receive(typingFrame('bob', 'c-bob', target))
    receive(typingFrame('carol', 'c-carol', target))
    receive(typingFrame('bob', 'c-bob', null))
    expect(channel.getState().typing.map(entry => entry.clientId)).toEqual(['c-carol'])

    receive(leaveFrame('carol', 'c-carol'))
    expect(channel.getState().typing).toEqual([])
    channel.dispose()
  })

  it('ignores its own typing echo', () => {
    const { channel, receive } = createAliceChannel()

    receive(typingFrame('alice', 'c-alice', target))

    expect(channel.getState().typing).toEqual([])
    channel.dispose()
  })
})

describe('multiplayer:typing frame schema', () => {
  it('accepts a target without content', () => {
    expect(isMultiplayerMessage(typingFrame('bob', 'c-bob', target))).toBe(true)
    expect(isMultiplayerMessage(typingFrame('bob', 'c-bob', { collection: 'todos', key: 'a' }))).toBe(true)
    expect(isMultiplayerMessage(typingFrame('bob', 'c-bob', null))).toBe(true)
  })

  it.each([
    ['a content field', { ...typingFrame('bob', 'c-bob', target), content: 'secret draft' }],
    ['a target content field', typingFrame('bob', 'c-bob', { ...target, text: 'secret draft' })],
    ['a missing target', { type: 'multiplayer:typing', roomId: 'room', userId: 'bob', clientId: 'c-bob' }],
    ['an invalid key', typingFrame('bob', 'c-bob', { collection: 'todos', key: { id: 1 } })],
    ['a missing collection', typingFrame('bob', 'c-bob', { key: 1 })],
  ])('rejects %s', (_name, frame) => {
    expect(isMultiplayerMessage(frame)).toBe(false)
    expect(parseMultiplayerMessage(JSON.stringify(frame))).toBeNull()
  })
})
