import type { RoomPeer } from '../src/runtime/server/rooms'
import { describe, expect, it, vi } from 'vitest'
import { Room, RoomRegistry } from '../src/runtime/server/rooms'

function makePeer(id: string): RoomPeer & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    id,
    send: (payload) => {
      sent.push(payload)
    },
    sent,
  }
}

describe('room', () => {
  it('rejects joins past maxSize', () => {
    const room = new Room('r', 2)
    expect(room.add(makePeer('a'))).toBe(true)
    expect(room.add(makePeer('b'))).toBe(true)
    expect(room.add(makePeer('c'))).toBe(false)
    expect(room.size).toBe(2)
  })

  it('ignores duplicate peer ids', () => {
    const room = new Room('r', 2)
    const peer = makePeer('a')
    expect(room.add(peer)).toBe(true)
    expect(room.add(peer)).toBe(true)
    expect(room.size).toBe(1)
  })

  it('broadcast skips the origin peer', () => {
    const room = new Room('r', 4)
    const a = makePeer('a')
    const b = makePeer('b')
    const c = makePeer('c')
    room.add(a)
    room.add(b)
    room.add(c)
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' }, 'b')
    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(0)
    expect(c.sent).toHaveLength(1)
  })

  it('broadcast isolates per-peer send failures', () => {
    const room = new Room('r', 4)
    const good = makePeer('good')
    const bad: RoomPeer = {
      id: 'bad',
      send: vi.fn(() => { throw new Error('boom') }),
    }
    room.add(bad)
    room.add(good)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' })
    expect(good.sent).toHaveLength(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('broadcast continues to remaining peers when a peer in the middle throws', () => {
    // First and last peers must each receive exactly one message even
    // though the middle peer's send raises. Validates that the loop
    // doesn't short-circuit on failure.
    const room = new Room('r', 4)
    const first = makePeer('first')
    const middle: RoomPeer = {
      id: 'middle',
      send: vi.fn(() => { throw new Error('boom') }),
    }
    const last = makePeer('last')
    room.add(first)
    room.add(middle)
    room.add(last)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' })
    spy.mockRestore()
    expect(first.sent).toHaveLength(1)
    expect(last.sent).toHaveLength(1)
    expect(middle.send).toHaveBeenCalledTimes(1)
  })

  it('preserves message contents across all recipients', () => {
    const room = new Room('r', 4)
    const a = makePeer('a')
    const b = makePeer('b')
    room.add(a)
    room.add(b)
    const message = {
      type: 'multiplayer:update' as const,
      roomId: 'r',
      userId: 'u',
      data: { cursor: { line: 1, ch: 5 } },
    }
    room.broadcast(message)
    // Each peer must receive the same payload object — no copying, no
    // truncation, identical reference.
    expect(a.sent[0]).toBe(message)
    expect(b.sent[0]).toBe(message)
  })

  it('does not deliver to a peer that joined after broadcast started', () => {
    // A late joiner must not see in-flight messages — broadcast iterates
    // over the membership snapshot at call time. We verify by triggering
    // a join from inside another peer's send handler.
    const room = new Room('r', 4)
    const lateJoiner = makePeer('late')
    let attemptedAdd = false
    const triggering: RoomPeer = {
      id: 'trigger',
      send: () => {
        if (!attemptedAdd) {
          attemptedAdd = true
          room.add(lateJoiner)
        }
      },
    }
    room.add(triggering)
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' })
    // The late joiner must not have received the in-flight message.
    expect(lateJoiner.sent).toHaveLength(0)
    expect(attemptedAdd).toBe(true)
  })

  it('exceptPeerId is matched as a string — does not skip peers with similar ids', () => {
    const room = new Room('r', 4)
    const a = makePeer('a')
    const ab = makePeer('ab') // substring overlap with 'a'
    room.add(a)
    room.add(ab)
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' }, 'a')
    expect(a.sent).toHaveLength(0)
    // Exact string equality only — 'ab' must still receive.
    expect(ab.sent).toHaveLength(1)
  })

  it('removes a peer that has left so subsequent broadcasts skip it', () => {
    const room = new Room('r', 4)
    const a = makePeer('a')
    const b = makePeer('b')
    room.add(a)
    room.add(b)
    room.remove('a')
    room.broadcast({ type: 'multiplayer:leave', roomId: 'r', userId: 'u' })
    expect(a.sent).toHaveLength(0)
    expect(b.sent).toHaveLength(1)
  })
})

describe('roomRegistry', () => {
  it('creates rooms lazily and evicts on empty', () => {
    const registry = new RoomRegistry({ maxRoomSize: 4 })
    const room = registry.getOrCreate('r1')
    room.add(makePeer('a'))
    expect(registry.rooms.size).toBe(1)
    registry.leave('r1', 'a')
    expect(registry.rooms.size).toBe(0)
  })

  it('leaveAll cleans up across rooms', () => {
    const registry = new RoomRegistry({ maxRoomSize: 4 })
    registry.getOrCreate('r1').add(makePeer('a'))
    registry.getOrCreate('r1').add(makePeer('b'))
    registry.getOrCreate('r2').add(makePeer('a'))
    const affected = registry.leaveAll('a')
    expect(affected.sort()).toEqual(['r1', 'r2'])
    expect(registry.rooms.get('r1')?.size).toBe(1)
    expect(registry.rooms.has('r2')).toBe(false)
  })

  it('allows the same peer id in different rooms (different connections)', () => {
    // A peer id is scoped to a single room — the same id can exist in two
    // rooms via two distinct connections (e.g. two browser tabs).
    const registry = new RoomRegistry({ maxRoomSize: 4 })
    expect(registry.getOrCreate('r1').add(makePeer('a'))).toBe(true)
    expect(registry.getOrCreate('r2').add(makePeer('a'))).toBe(true)
    expect(registry.rooms.get('r1')?.size).toBe(1)
    expect(registry.rooms.get('r2')?.size).toBe(1)
  })

  it('leave is a no-op for unknown rooms / peers', () => {
    const registry = new RoomRegistry({ maxRoomSize: 4 })
    expect(() => registry.leave('does-not-exist', 'a')).not.toThrow()
    registry.getOrCreate('r1').add(makePeer('a'))
    expect(() => registry.leave('r1', 'unknown-peer')).not.toThrow()
    expect(registry.rooms.get('r1')?.size).toBe(1)
  })

  it('leaveAll returns empty when peer is in no rooms', () => {
    const registry = new RoomRegistry({ maxRoomSize: 4 })
    registry.getOrCreate('r1').add(makePeer('a'))
    expect(registry.leaveAll('not-a-member')).toEqual([])
  })

  it('default maxRoomSize is 100', () => {
    const registry = new RoomRegistry()
    const room = registry.getOrCreate('r')
    for (let i = 0; i < 100; i++) {
      expect(room.add(makePeer(`p${i}`))).toBe(true)
    }
    expect(room.add(makePeer('overflow'))).toBe(false)
  })
})
