import { afterEach, describe, expect, it } from 'vitest'
import { rstoreMultiplayerServerHooks } from '../src/runtime/server/hooks'
import { frame, makeHandler, makePeer, observeSettlement, presence } from './ws-helpers'

describe('websocket pending policy lifecycle', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
  })

  it('closing during authorization cannot restore a dead peer or consume its replacement slot', async () => {
    const hooks = makeHandler({ maxRoomSize: 2 })
    const observer = makePeer('observer')
    const applicant = makePeer('applicant')
    const replacement = makePeer('replacement')
    await hooks.message(observer, presence('document', 'bob', 'bob-tab'))

    let entered = false
    const decision = Promise.withResolvers<void>()
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, setUserId }) => {
      if (peer.id === applicant.id) {
        entered = true
        await decision.promise
        setUserId('verified-alice')
      }
    }))
    const pending = hooks.message(applicant, presence('document', 'alice', 'alice-tab'))
    const settled = observeSettlement(pending)
    try {
      await expect.poll(() => entered, { timeout: 500, message: 'authorization receives applicant' }).toBe(true)
      expect(settled()).toBe(false)
      hooks.close(applicant)
    }
    finally {
      decision.resolve()
      await expect.poll(settled, { timeout: 500, message: 'closed join completes after policy release' }).toBe(true)
      await pending
    }

    await hooks.message(replacement, presence('document', 'carol', 'carol-tab'))
    expect(observer.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: 'carol-tab',
      user: { id: 'carol', name: 'carol', color: '#fff' },
    }])
    await hooks.message(observer, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'live members only' },
    }))
    expect(replacement.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'bob',
      clientId: 'bob-tab',
      data: { title: 'live members only' },
    }])
    expect(applicant.received).toEqual([])
  })

  it.each(['disconnect', 'leave and rejoin'] as const)('drops an edit held by filtering after %s', async (departure) => {
    const hooks = makeHandler({ maxRoomSize: 2 })
    const alice = makePeer('alice')
    const bob = makePeer('bob')
    await hooks.message(alice, presence('document', 'alice', 'alice-tab'))
    await hooks.message(bob, presence('document', 'bob', 'bob-tab'))
    alice.received.length = 0

    let entered = false
    const decision = Promise.withResolvers<void>()
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.filter', async ({ message }) => {
      if (message.type === 'multiplayer:update' && message.data.title === 'stale edit') {
        entered = true
        await decision.promise
      }
    }))
    const pending = hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
      data: { title: 'stale edit' },
    }))
    const settled = observeSettlement(pending)
    try {
      await expect.poll(() => entered, { timeout: 500, message: 'filter receives pending edit' }).toBe(true)
      expect(settled()).toBe(false)
      if (departure === 'disconnect') {
        hooks.close(alice)
      }
      else {
        await hooks.message(alice, frame({
          type: 'multiplayer:leave',
          roomId: 'document',
          userId: 'alice',
          clientId: 'alice-tab',
        }))
        await hooks.message(alice, presence('document', 'alice', 'alice-tab'))
      }
    }
    finally {
      decision.resolve()
      await expect.poll(settled, { timeout: 500, message: 'departed edit completes after policy release' }).toBe(true)
      await pending
    }

    const expected: unknown[] = [{
      type: 'multiplayer:leave',
      roomId: 'document',
      userId: 'alice',
      clientId: 'alice-tab',
    }]
    const livePeer = departure === 'disconnect' ? makePeer('replacement') : alice
    if (departure === 'disconnect') {
      await hooks.message(livePeer, presence('document', 'carol', 'carol-tab'))
    }
    expected.push({
      type: 'multiplayer:presence',
      roomId: 'document',
      clientId: departure === 'disconnect' ? 'carol-tab' : 'alice-tab',
      user: departure === 'disconnect'
        ? { id: 'carol', name: 'carol', color: '#fff' }
        : { id: 'alice', name: 'alice', color: '#fff' },
    })
    expect(bob.received).toEqual(expected)
    bob.received.length = 0
    await hooks.message(livePeer, frame({
      type: 'multiplayer:update',
      roomId: 'document',
      userId: 'spoof',
      clientId: 'spoof-tab',
      data: { title: 'fresh edit' },
    }))
    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'document',
      userId: departure === 'disconnect' ? 'carol' : 'alice',
      clientId: departure === 'disconnect' ? 'carol-tab' : 'alice-tab',
      data: { title: 'fresh edit' },
    }])
    expect(alice.received).toEqual([])
  })
})
