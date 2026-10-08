import { afterEach, describe, expect, it, vi } from 'vitest'
import { rstoreMultiplayerServerHooks } from '../src/runtime/server/hooks'
import { frame, makeHandler, makePeer, presence } from './ws-helpers'

describe('ws-handler identity binding', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
    vi.restoreAllMocks()
  })

  it('rewrites a spoofed leave to the sender\'s bound identity', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    // Alice tries to erase Bob's presence by spoofing his identity.
    await hooks.message(alice, frame({
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'bob',
      clientId: 'cB',
    }))

    expect(bob.received).toEqual([{
      type: 'multiplayer:leave',
      roomId: 'room',
      userId: 'alice',
      clientId: 'cA',
    }])
    alice.received.length = 0
    const carol = makePeer('pC')
    await hooks.message(carol, presence('room', 'carol', 'cC'))
    expect(bob.received[1]).toEqual({
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'cC',
      user: { id: 'carol', name: 'carol', color: '#fff' },
    })
    carol.received.length = 0
    await hooks.message(bob, frame({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'bob',
      clientId: 'cB',
      data: { title: 'Bob still belongs to the room' },
    }))
    expect(carol.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'bob',
      clientId: 'cB',
      data: { title: 'Bob still belongs to the room' },
    }])
    expect(alice.received).toEqual([])
  })

  it('rewrites spoofed presence user.id to the bound identity', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    // Alice impersonates Bob in a presence frame.
    await hooks.message(alice, frame({
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'spoofed-tab',
      user: { id: 'bob', name: 'bob', color: '#fff' },
      field: 'body',
      cursor: { start: 3, end: 11, direction: 'backward' },
    }))

    expect(bob.received).toEqual([{
      type: 'multiplayer:presence',
      roomId: 'room',
      clientId: 'cA',
      user: { id: 'alice', name: 'bob', color: '#fff' },
      field: 'body',
      cursor: { start: 3, end: 11, direction: 'backward' },
    }])
  })

  it('stamps updates with the bound clientId', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    await hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'alice',
      clientId: 'cB', // spoofed connection id
      data: { title: 'x' },
    }))

    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'alice',
      clientId: 'cA',
      data: { title: 'x' },
    }])
  })

  it('binds the identity set by the authorize hook over client-supplied ids', async () => {
    disposers.push(rstoreMultiplayerServerHooks.hook('multiplayer.authorize', (payload) => {
      payload.setUserId('server-verified')
    }))

    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'spoofed-id', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    await hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'someone-else',
      clientId: 'cA',
      data: { title: 'x' },
    }))

    expect(bob.received).toEqual([{
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'server-verified',
      clientId: 'cA',
      data: { title: 'x' },
    }])
  })
})

describe('ws-handler upgrade origin check', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Builds the real upgrade request headers consumed by h3 hooks. */
  function upgradeRequest(origin: string | null, host = 'example.com') {
    const headers = new Headers({ host })
    if (origin) {
      headers.set('origin', origin)
    }
    return { url: `http://${host}/api/rstore-multiplayer/ws`, headers }
  }

  it('rejects cross-origin upgrades with 403 by default', async () => {
    const hooks = makeHandler()
    const response = await hooks.upgrade(upgradeRequest('https://evil.test'))
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(403)
  })

  it('accepts same-origin upgrades', async () => {
    const hooks = makeHandler()
    expect(await hooks.upgrade(upgradeRequest('http://example.com'))).toBeUndefined()
  })

  it('accepts allowlisted origins', async () => {
    const hooks = makeHandler({ allowedOrigins: ['https://app.example.com'] })
    expect(await hooks.upgrade(upgradeRequest('https://app.example.com'))).toBeUndefined()
    const rejected = await hooks.upgrade(upgradeRequest('https://evil.test'))
    expect((rejected as Response).status).toBe(403)
  })

  it('skips the check when allowedOrigins is false', async () => {
    const hooks = makeHandler({ allowedOrigins: false })
    expect(await hooks.upgrade(upgradeRequest('https://evil.test'))).toBeUndefined()
  })
})

describe('ws-handler authorize hook warning', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns once when no authorize handler is registered', async () => {
    const warn = vi.spyOn(console, 'warn')
    const hooks = makeHandler()
    const request = { url: 'http://example.com/ws', headers: new Headers({ host: 'example.com', origin: 'http://example.com' }) }

    await hooks.upgrade(request)
    await hooks.upgrade(request)

    const authorizeWarnings = warn.mock.calls.filter(call => String(call[0]).includes('multiplayer.authorize'))
    expect(authorizeWarnings).toHaveLength(1)
  })

  it('does not warn when an authorize handler is registered', async () => {
    const dispose = rstoreMultiplayerServerHooks.hook('multiplayer.authorize', () => {})
    try {
      const warn = vi.spyOn(console, 'warn')
      const hooks = makeHandler()
      await hooks.upgrade({ url: 'http://example.com/ws', headers: new Headers({ host: 'example.com' }) })
      const authorizeWarnings = warn.mock.calls.filter(call => String(call[0]).includes('multiplayer.authorize'))
      expect(authorizeWarnings).toHaveLength(0)
    }
    finally {
      dispose()
    }
  })
})
