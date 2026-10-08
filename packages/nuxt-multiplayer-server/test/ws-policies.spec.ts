import { afterEach, describe, expect, it } from 'vitest'
import { rstoreMultiplayerServerHooks } from '../src/runtime/server/hooks'
import { frame, makeHandler, makePeer, presence } from './ws-helpers'

describe('websocket room policies', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
  })

  it('authorizes each room after binding identity and keeps an allowed room usable after denial', async () => {
    const hooks = makeHandler()
    const publicPeer = makePeer('public-peer')
    const privatePeer = makePeer('private-peer')
    const applicant = makePeer('applicant')
    await hooks.message(publicPeer, presence('public', 'bob', 'bob-tab'))
    await hooks.message(privatePeer, presence('private', 'carol', 'carol-tab'))
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.authorize', ({ peer, roomId, reject, setUserId }) => {
      if (peer.id === applicant.id) {
        if (roomId === 'private') {
          reject()
        }
        else {
          setUserId('verified-alice')
        }
      }
    }))

    await hooks.message(applicant, presence('public', 'claimed', 'alice-tab'))
    expect(publicPeer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'public',
      clientId: 'alice-tab',
      user: { id: 'verified-alice', name: 'claimed', color: '#fff' },
    }])
    await hooks.message(applicant, presence('private', 'claimed', 'alice-tab'))
    expect(privatePeer.received).toEqual([])
    await hooks.message(privatePeer, frame({
      type: 'multiplayer:update',
      roomId: 'private',
      userId: 'carol',
      clientId: 'carol-tab',
      data: { title: 'secret contents' },
    }))
    expect(applicant.received).toEqual([])

    publicPeer.received.length = 0
    await hooks.message(applicant, frame({
      type: 'multiplayer:update',
      roomId: 'public',
      userId: 'spoofed',
      clientId: 'spoofed-tab',
      data: { title: 'allowed edit' },
    }))
    expect(publicPeer.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'public',
      userId: 'verified-alice',
      clientId: 'alice-tab',
      data: { title: 'allowed edit' },
    }])
    expect(privatePeer.received).toEqual([])
  })

  it('rejects a throwing authorize policy without binding identity or membership, then admits a fresh retry', async () => {
    const hooks = makeHandler({ maxRoomSize: 2 })
    const observer = makePeer('observer')
    const otherRoom = makePeer('other-room')
    const applicant = makePeer('applicant')
    await hooks.message(observer, presence('document', 'bob', 'bob-tab'))
    await hooks.message(otherRoom, presence('other', 'carol', 'carol-tab'))
    let failPolicy = true
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.authorize', ({ peer, setUserId }) => {
      if (peer.id === applicant.id) {
        setUserId(failPolicy ? 'failed-identity' : 'verified-alice')
        if (failPolicy) {
          throw new Error('authorization unavailable')
        }
      }
    }))

    await hooks.message(applicant, presence('document', 'unverified', 'failed-tab'))
    expect(observer.received).toEqual([])
    await hooks.message(observer, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'before retry' },
    }))
    expect(applicant.received).toEqual([])

    failPolicy = false
    await hooks.message(applicant, presence('document', 'new claim', 'retry-tab'))
    expect(observer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'retry-tab',
      user: { id: 'verified-alice', name: 'new claim', color: '#fff' },
    }])
    observer.received.length = 0
    await hooks.message(applicant, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'spoofed',
      clientId: 'spoofed-tab',
      data: { title: 'retry edit', selection: { start: 2, end: 7 }, tags: ['one', 'two'] },
    }))
    expect(observer.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'verified-alice',
      clientId: 'retry-tab',
      data: { title: 'retry edit', selection: { start: 2, end: 7 }, tags: ['one', 'two'] },
    }])
    expect(otherRoom.received).toEqual([])
    expect(applicant.received).toEqual([])
  })

  it('withholds edits when a filter policy throws and preserves membership and later payloads', async () => {
    const hooks = makeHandler()
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    const carol = makePeer('carol')
    await hooks.message(alice, presence('document', 'alice', 'alice-tab'))
    await hooks.message(bob, presence('document', 'bob', 'bob-tab'))
    await hooks.message(carol, presence('other', 'carol', 'carol-tab'))
    alice.received.length = 0
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.filter', ({ message }) => {
      if (message.type === 'multiplayer:update' && message.data.title === 'forbidden') {
        throw new Error('filter unavailable')
      }
    }))

    await hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'forbidden' },
    }))
    expect(bob.received).toEqual([])
    await hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'spoofed',
      clientId: 'spoofed-tab',
      data: { title: 'allowed', selection: { start: 1, end: 9 }, tags: ['first', 'second'] },
    }))
    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'allowed', selection: { start: 1, end: 9 }, tags: ['first', 'second'] },
    }])
    await hooks.message(bob, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'reply after error' },
    }))
    expect(alice.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'reply after error' },
    }])
    expect(carol.received).toEqual([])
  })
})
