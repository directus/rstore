import { describe, expect, it } from 'vitest'
import { frame, makeHandler, makePeer, presence } from './ws-helpers'

describe('websocket admission and reconnect workflows', () => {
  it('drops malformed and oversized first frames without reserving a room slot or identity', async () => {
    const hooks = makeHandler({ maxRoomSize: 2, maxMessageBytes: 256 })
    const observer = makePeer('observer')
    const applicant = makePeer('applicant')
    const replacement = makePeer('replacement')
    await hooks.message(observer, presence('document', 'observer', 'observer-tab'))

    await hooks.message(applicant, frame({
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'invalid-tab',
      user: { id: 'invalid-user' },
    }))
    await hooks.message(applicant, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'oversized-user',
      clientId: 'oversized-tab',
      data: { title: 'x'.repeat(300) },
    }))
    expect(observer.received).toEqual([])

    await hooks.message(replacement, presence('document', 'replacement', 'replacement-tab'))
    expect(observer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'replacement-tab',
      user: { id: 'replacement', name: 'replacement', color: '#fff' },
    }])
    observer.received.length = 0

    // Full-room rejection must not bind the rejected connection's claimed identity.
    await hooks.message(applicant, presence('document', 'denied-user', 'denied-tab'))
    expect(observer.received).toEqual([])
    await hooks.message(observer, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'observer',
      clientId: 'observer-tab',
      data: { title: 'members only' },
    }))
    expect(applicant.received).toEqual([])
    hooks.close(replacement)
    observer.received.length = 0

    await hooks.message(applicant, presence('document', 'approved-user', 'approved-tab'))
    expect(observer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'approved-tab',
      user: { id: 'approved-user', name: 'approved-user', color: '#fff' },
    }])
  })

  it('leaving one document removes its subscription while another document stays usable', async () => {
    const hooks = makeHandler()
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    const carol = makePeer('carol')
    await hooks.message(alice, presence('first', 'alice', 'alice-tab'))
    await hooks.message(alice, presence('second', 'alice', 'alice-tab'))
    await hooks.message(bob, presence('first', 'bob', 'bob-tab'))
    await hooks.message(carol, presence('second', 'carol', 'carol-tab'))
    alice.received.length = 0

    await hooks.message(alice, frame({
      type: 'multiplayer:leave',
      roomId: 'first',
      userId: 'alice',
      clientId: 'alice-tab',
    }))
    expect(bob.received).toEqual([{
      type: 'multiplayer:leave',
      roomId: 'first',
      userId: 'alice',
      clientId: 'alice-tab',
    }])
    expect(carol.received).toEqual([])
    await hooks.message(bob, frame({
      type: 'multiplayer:update',
      roomId: 'first',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'left document' },
    }))
    expect(alice.received).toEqual([])
    await hooks.message(carol, frame({
      type: 'multiplayer:update',
      roomId: 'second',
      userId: 'carol',
      clientId: 'carol-tab',
      data: { title: 'still subscribed' },
    }))
    expect(alice.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'second',
      userId: 'carol',
      clientId: 'carol-tab',
      data: { title: 'still subscribed' },
    }])
  })

  it('limits each connection independently and renews identity and quota after disconnect', async () => {
    const hooks = makeHandler({ rateLimit: { capacity: 2, refillPerSecond: 0 } })
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    await hooks.message(alice, presence('document', 'alice', 'old-tab'))
    await hooks.message(bob, presence('document', 'bob', 'bob-tab'))
    alice.received.length = 0
    const accepted = {
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'old-tab',
      data: { title: 'accepted' },
    }
    await hooks.message(alice, frame(accepted))
    await hooks.message(alice, frame({ ...accepted, data: { title: 'over quota' } }))
    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'old-tab',
      data: { title: 'accepted' },
    }])
    await hooks.message(bob, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'independent quota' },
    }))
    expect(alice.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'independent quota' },
    }])

    hooks.close(alice)
    bob.received.length = 0
    const reconnected = makePeer('alice')
    await hooks.message(reconnected, presence('document', 'new-user', 'new-tab'))
    await hooks.message(reconnected, frame({
      ...accepted,
      userId: 'new-user',
      clientId: 'new-tab',
      data: { title: 'after reconnect' },
    }))
    expect(bob.received).toEqual([
      {
        type: 'multiplayer:presence',
        roomId: 'document',
        clientId: 'new-tab',
        user: { id: 'new-user', name: 'new-user', color: '#fff' },
      },
      {
        type: 'multiplayer:update',
        roomId: 'document',
        userId: 'new-user',
        clientId: 'new-tab',
        data: { title: 'after reconnect' },
      },
    ])
  })
})
