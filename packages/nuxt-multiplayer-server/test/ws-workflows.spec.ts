import { afterEach, describe, expect, it } from 'vitest'
import { rstoreMultiplayerServerHooks } from '../src/runtime/server/hooks'
import { frame, makeHandler, makePeer, observeSettlement, presence } from './ws-helpers'

describe('websocket room workflows', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
  })

  it('awaits authorization, drops denied joins, and admits a later verified retry only to its room', async () => {
    const hooks = makeHandler({ maxRoomSize: 2 })
    const observer = makePeer('observer')
    const otherRoom = makePeer('other-room')
    const applicant = makePeer('applicant')
    await hooks.message(observer, presence('document', 'bob', 'bob-tab'))
    await hooks.message(otherRoom, presence('private', 'carol', 'carol-tab'))

    let entered = false
    const decision = Promise.withResolvers<void>()
    let approved = false
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, reject, setUserId }) => {
      if (peer.id !== applicant.id) {
        return
      }
      if (!approved) {
        entered = true
        await decision.promise
        reject()
        return
      }
      setUserId('verified-alice')
    }))

    const deniedJoin = hooks.message(applicant, presence('document', 'unverified', 'denied-tab'))
    const joinSettled = observeSettlement(deniedJoin)
    try {
      await expect.poll(() => entered, { timeout: 500, message: 'authorization hook receives pending join' }).toBe(true)
      expect(joinSettled(), 'join waits for authorization decision').toBe(false)
      expect(observer.received).toEqual([])
    }
    finally {
      decision.resolve()
      await expect.poll(joinSettled, { timeout: 500, message: 'denied join completes after authorization decision' }).toBe(true)
      await deniedJoin
    }
    expect(observer.received).toEqual([])

    // Denial must not leave a hidden room subscription behind.
    const beforeApproval = {
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'before approval' },
    }
    await hooks.message(observer, frame(beforeApproval))
    expect(applicant.received).toEqual([])

    approved = true
    await hooks.message(applicant, presence('document', 'client-claimed', 'allowed-tab'))
    expect(observer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'allowed-tab',
      user: { id: 'verified-alice', name: 'client-claimed', color: '#fff' },
    }])
    expect(otherRoom.received).toEqual([])
    expect(applicant.received).toEqual([])
    observer.received.length = 0

    await hooks.message(applicant, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'spoofed',
      clientId: 'spoofed-tab',
      data: { title: 'approved edit' },
    }))
    expect(observer.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'verified-alice',
      clientId: 'allowed-tab',
      data: { title: 'approved edit' },
    }])
    expect(otherRoom.received).toEqual([])
  })

  it('awaits filtering, withholds rejected edits, and delivers the next accepted edit intact', async () => {
    const hooks = makeHandler()
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    await hooks.message(alice, presence('document', 'alice', 'alice-tab'))
    await hooks.message(bob, presence('document', 'bob', 'bob-tab'))
    alice.received.length = 0

    let entered = false
    const decision = Promise.withResolvers<void>()
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.filter', async ({ message, reject }) => {
      if (message.type === 'multiplayer:update' && message.data.title === 'forbidden') {
        entered = true
        await decision.promise
        reject()
      }
    }))

    const rejectedEdit = hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'forbidden' },
    }))
    const editSettled = observeSettlement(rejectedEdit)
    try {
      await expect.poll(() => entered, { timeout: 500, message: 'filter hook receives pending edit' }).toBe(true)
      expect(editSettled(), 'edit waits for filter decision').toBe(false)
      expect(bob.received).toEqual([])
    }
    finally {
      decision.resolve()
      await expect.poll(editSettled, { timeout: 500, message: 'rejected edit completes after filter decision' }).toBe(true)
      await rejectedEdit
    }
    expect(bob.received).toEqual([])
    expect(alice.received).toEqual([])

    const accepted = {
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'allowed', cursor: { line: 3, ch: 7 } },
    }
    await hooks.message(alice, frame(accepted))
    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'allowed', cursor: { line: 3, ch: 7 } },
    }])
    expect(alice.received).toEqual([])
  })

  it('disconnects from every room, frees full-room slots, and prevents stale delivery', async () => {
    const hooks = makeHandler({ maxRoomSize: 2 })
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    const carol = makePeer('carol')
    const david = makePeer('david')
    await hooks.message(alice, presence('first', 'alice', 'alice-tab'))
    await hooks.message(alice, presence('second', 'spoofed', 'spoofed-tab'))
    await hooks.message(bob, presence('first', 'bob', 'bob-tab'))
    await hooks.message(carol, presence('second', 'carol', 'carol-tab'))
    alice.received.length = 0

    hooks.close(alice)
    expect(bob.received).toEqual([{
      type: 'multiplayer:leave',
      roomId: 'first',
      userId: 'alice',
      clientId: 'alice-tab',
    }])
    expect(carol.received).toEqual([{
      type: 'multiplayer:leave',
      roomId: 'second',
      userId: 'alice',
      clientId: 'alice-tab',
    }])

    // Each room was full. A new member can join only if close released both slots.
    await hooks.message(david, presence('first', 'david', 'david-tab'))
    await hooks.message(david, presence('second', 'david', 'david-tab'))
    expect(bob.received[1]).toEqual({
      type: 'multiplayer:presence',
      roomId: 'first',
      clientId: 'david-tab',
      user: { id: 'david', name: 'david', color: '#fff' },
    })
    expect(carol.received[1]).toEqual({
      type: 'multiplayer:presence',
      roomId: 'second',
      clientId: 'david-tab',
      user: { id: 'david', name: 'david', color: '#fff' },
    })

    await hooks.message(david, frame({
      type: 'multiplayer:update',
      roomId: 'first',
      userId: 'david',
      clientId: 'david-tab',
      data: { title: 'first edit' },
    }))
    expect(bob.received).toHaveLength(3)
    expect(bob.received[2]).toEqual({
      type: 'multiplayer:update',
      roomId: 'first',
      userId: 'david',
      clientId: 'david-tab',
      data: { title: 'first edit' },
    })
    expect(carol.received).toHaveLength(2)
    await hooks.message(david, frame({
      type: 'multiplayer:update',
      roomId: 'second',
      userId: 'david',
      clientId: 'david-tab',
      data: { title: 'second edit' },
    }))
    expect(carol.received).toHaveLength(3)
    expect(carol.received[2]).toEqual({
      type: 'multiplayer:update',
      roomId: 'second',
      userId: 'david',
      clientId: 'david-tab',
      data: { title: 'second edit' },
    })
    expect(bob.received).toHaveLength(3)
    expect(alice.received).toEqual([])
    expect(david.received).toEqual([])
  })
})
