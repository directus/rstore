import type { MultiplayerServerPeer } from '@rstore/multiplayer/server'
import { createMultiplayerServer, createMultiplayerServerHooks } from '@rstore/multiplayer/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Fake transport connection recording every frame sent to it (parsed back from text). */
interface FakePeer extends MultiplayerServerPeer {
  received: any[]
}

function makePeer(id: string): FakePeer {
  const received: any[] = []
  return {
    id,
    send: (text) => {
      received.push(JSON.parse(text))
    },
    received,
  }
}

function makeServer(options: Partial<Parameters<typeof createMultiplayerServer<FakePeer>>[0]> = {}) {
  return createMultiplayerServer<FakePeer>({
    maxRoomSize: 10,
    maxMessageBytes: 64 * 1024,
    rateLimit: null,
    ...options,
  })
}

function presence(roomId: string, userId: string, clientId: string) {
  return JSON.stringify({
    type: 'multiplayer:presence',
    roomId,
    clientId,
    user: { id: userId, name: userId, color: '#fff' },
  })
}

function update(roomId: string, userId: string, clientId: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({ type: 'multiplayer:update', roomId, userId, clientId, data })
}

/** Alice and Bob both joined `room`; Bob's inbox is emptied. */
async function joinAliceAndBob(server: ReturnType<typeof makeServer>) {
  const alice = makePeer('pA')
  const bob = makePeer('pB')
  await server.handleMessage(alice, presence('room', 'alice', 'cA'))
  await server.handleMessage(bob, presence('room', 'bob', 'cB'))
  bob.received.length = 0
  alice.received.length = 0
  return { alice, bob }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createMultiplayerServer identity binding', () => {
  it('rewrites a spoofed leave to the sender\'s bound identity', async () => {
    const server = makeServer()
    const { alice, bob } = await joinAliceAndBob(server)

    // Alice tries to erase Bob's presence by spoofing his identity.
    await server.handleMessage(alice, JSON.stringify({ type: 'multiplayer:leave', roomId: 'room', userId: 'bob', clientId: 'cB' }))

    expect(bob.received).toEqual([{ type: 'multiplayer:leave', roomId: 'room', userId: 'alice', clientId: 'cA' }])
  })

  it('rewrites spoofed presence user.id to the bound identity', async () => {
    const server = makeServer()
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, presence('room', 'bob', 'cA'))

    expect(bob.received).toHaveLength(1)
    expect(bob.received[0].user.id).toBe('alice')
  })

  it('stamps updates with the bound clientId', async () => {
    const server = makeServer()
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, update('room', 'alice', 'cB', { title: 'x' }))

    expect(bob.received).toEqual([{ type: 'multiplayer:update', roomId: 'room', userId: 'alice', clientId: 'cA', data: { title: 'x' } }])
  })

  it('binds the identity set by the authorize hook over client-supplied ids', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    hooks.hook('multiplayer.authorize', payload => payload.setUserId('server-verified'))
    const server = makeServer({ hooks })
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, update('room', 'someone-else', 'cA'))

    expect(bob.received[0].userId).toBe('server-verified')
  })

  it('broadcasts the bound identity in the leave synthesized on close', async () => {
    const server = makeServer()
    const alice = makePeer('pA')
    const bob = makePeer('pB')
    await server.handleMessage(alice, presence('room', 'alice', 'cA'))
    // Alice later claims to be Bob: the bound identity does not change.
    await server.handleMessage(alice, update('room', 'bob', 'cB'))
    await server.handleMessage(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0
    alice.received.length = 0

    server.handleClose(alice.id)

    expect(bob.received).toEqual([{ type: 'multiplayer:leave', roomId: 'room', userId: 'alice', clientId: 'cA' }])
    // The closed peer left every room: later frames are not sent to it.
    await server.handleMessage(bob, update('room', 'bob', 'cB'))
    expect(alice.received).toEqual([])
  })
})

describe('createMultiplayerServer authorize hook', () => {
  it('runs once per peer and room, with the transport peer', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    const calls: Array<{ peerId: string, roomId: string }> = []
    hooks.hook('multiplayer.authorize', ({ peer, roomId }) => {
      calls.push({ peerId: peer.id, roomId })
    })
    const server = makeServer({ hooks })
    const alice = makePeer('pA')

    await server.handleMessage(alice, presence('room', 'alice', 'cA'))
    await server.handleMessage(alice, update('room', 'alice', 'cA'))
    await server.handleMessage(alice, presence('other', 'alice', 'cA'))

    expect(calls).toEqual([{ peerId: 'pA', roomId: 'room' }, { peerId: 'pA', roomId: 'other' }])
  })

  it('drops frames of a rejected peer and keeps it out of the room', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    hooks.hook('multiplayer.authorize', ({ peer, reject }) => {
      if (peer.id === 'pM')
        reject('nope')
    })
    const server = makeServer({ hooks })
    const { alice } = await joinAliceAndBob(server)
    const mallory = makePeer('pM')

    await server.handleMessage(mallory, presence('room', 'mallory', 'cM'))
    await server.handleMessage(alice, update('room', 'alice', 'cA'))

    expect(alice.received).toEqual([])
    expect(mallory.received).toEqual([])
  })

  it('treats a throwing authorize handler as a rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hooks = createMultiplayerServerHooks<FakePeer>()
    hooks.hook('multiplayer.authorize', ({ peer }) => {
      if (peer.id === 'pM')
        throw new Error('boom')
    })
    const server = makeServer({ hooks })
    const { alice } = await joinAliceAndBob(server)

    await server.handleMessage(makePeer('pM'), presence('room', 'mallory', 'cM'))

    expect(alice.received).toEqual([])
  })

  it('authorizes again after an explicit leave', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    const authorize = vi.fn()
    hooks.hook('multiplayer.authorize', authorize)
    const server = makeServer({ hooks })
    const alice = makePeer('pA')

    await server.handleMessage(alice, presence('room', 'alice', 'cA'))
    await server.handleMessage(alice, JSON.stringify({ type: 'multiplayer:leave', roomId: 'room', userId: 'alice', clientId: 'cA' }))
    await server.handleMessage(alice, presence('room', 'alice', 'cA'))

    expect(authorize).toHaveBeenCalledTimes(2)
  })
})

describe('createMultiplayerServer filter hook', () => {
  it('stops the broadcast of a rejected frame only', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    hooks.hook('multiplayer.filter', ({ message, reject }) => {
      if (message.type === 'multiplayer:update' && message.data.secret)
        reject()
    })
    const server = makeServer({ hooks })
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, update('room', 'alice', 'cA', { secret: true }))
    await server.handleMessage(alice, update('room', 'alice', 'cA', { title: 'ok' }))

    expect(bob.received.map(frame => frame.data)).toEqual([{ title: 'ok' }])
  })

  it('drops the frame when a filter handler throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const hooks = createMultiplayerServerHooks<FakePeer>()
    hooks.hook('multiplayer.filter', ({ message }) => {
      if (message.type === 'multiplayer:update')
        throw new Error('boom')
    })
    const server = makeServer({ hooks })
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, update('room', 'alice', 'cA'))

    expect(bob.received).toEqual([])
  })

  it('sees the frame already stamped with the bound identity', async () => {
    const hooks = createMultiplayerServerHooks<FakePeer>()
    const seen: string[] = []
    hooks.hook('multiplayer.filter', ({ message }) => {
      seen.push(message.clientId)
    })
    const server = makeServer({ hooks })
    const { alice } = await joinAliceAndBob(server)
    seen.length = 0

    await server.handleMessage(alice, update('room', 'alice', 'spoofed'))

    expect(seen).toEqual(['cA'])
  })
})

describe('createMultiplayerServer limits', () => {
  it('drops frames larger than maxMessageBytes', async () => {
    const server = makeServer({ maxMessageBytes: 200 })
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, update('room', 'alice', 'cA', { title: 'x'.repeat(200) }))
    await server.handleMessage(alice, update('room', 'alice', 'cA', { title: 'small' }))

    expect(bob.received.map(frame => frame.data.title)).toEqual(['small'])
  })

  it('drops frames over the per-peer rate limit', async () => {
    vi.useFakeTimers({ now: 0 })
    try {
      const server = makeServer({ rateLimit: { capacity: 3, refillPerSecond: 1 } })
      const alice = makePeer('pA')
      const bob = makePeer('pB')
      // Joining costs one token.
      await server.handleMessage(alice, presence('room', 'alice', 'cA'))
      await server.handleMessage(bob, presence('room', 'bob', 'cB'))

      for (let i = 0; i < 4; i++)
        await server.handleMessage(alice, update('room', 'alice', 'cA', { i }))
      vi.advanceTimersByTime(1000)
      await server.handleMessage(alice, update('room', 'alice', 'cA', { i: 'refilled' }))

      expect(bob.received.filter(frame => frame.type === 'multiplayer:update').map(frame => frame.data.i)).toEqual([0, 1, 'refilled'])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects joins past maxRoomSize', async () => {
    const server = makeServer({ maxRoomSize: 2 })
    const { alice } = await joinAliceAndBob(server)
    const carol = makePeer('pC')

    await server.handleMessage(carol, presence('room', 'carol', 'cC'))
    await server.handleMessage(alice, update('room', 'alice', 'cA'))

    expect(alice.received).toEqual([])
    expect(carol.received).toEqual([])
  })

  it('ignores invalid frames', async () => {
    const server = makeServer()
    const { alice, bob } = await joinAliceAndBob(server)

    await server.handleMessage(alice, '{not json')
    await server.handleMessage(alice, JSON.stringify({ type: 'multiplayer:update', roomId: 'room' }))

    expect(bob.received).toEqual([])
  })
})

describe('createMultiplayerServer broadcast', () => {
  it('relays to every other room member, never to the sender or other rooms', async () => {
    const server = makeServer()
    const { alice, bob } = await joinAliceAndBob(server)
    const carol = makePeer('pC')
    await server.handleMessage(carol, presence('elsewhere', 'carol', 'cC'))

    await server.handleMessage(alice, update('room', 'alice', 'cA', { title: 'x' }))

    expect(bob.received).toHaveLength(1)
    expect(alice.received).toEqual([])
    expect(carol.received).toEqual([])
  })
})
