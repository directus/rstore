import type { Peer } from 'crossws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rstoreMultiplayerServerHooks } from '../src/runtime/server/hooks'
import { createMultiplayerWebSocketHandler } from '../src/runtime/server/ws-handler'

/** crossws-like hook surface extracted from the h3 handler. */
interface WsHooks {
  upgrade: (request: { url: string, headers: Headers }) => Promise<Response | void> | Response | void
  message: (peer: Peer, message: { text: () => string }) => Promise<void>
  close: (peer: Peer) => void
}

/** Test peer capturing every payload sent to it (parsed from JSON). */
function makePeer(id: string): Peer & { received: any[] } {
  const received: any[] = []
  return {
    id,
    send: (payload: unknown) => {
      received.push(typeof payload === 'string' ? JSON.parse(payload) : payload)
      return 0
    },
    received,
  } as unknown as Peer & { received: any[] }
}

function makeHandler(options: { allowedOrigins?: string[] | false } = {}): WsHooks {
  const handler = createMultiplayerWebSocketHandler({
    maxRoomSize: 10,
    maxMessageBytes: 64 * 1024,
    rateLimit: null,
    allowedOrigins: options.allowedOrigins,
  })
  return (handler as any).__websocket__ as WsHooks
}

function frame(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload)
  return { text: () => text }
}

function presence(roomId: string, userId: string, clientId: string) {
  return frame({
    type: 'multiplayer:presence',
    roomId,
    clientId,
    user: { id: userId, name: userId, color: '#fff' },
  })
}

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

    expect(bob.received).toHaveLength(1)
    // The frame was stamped with Alice's bound identity, not Bob's.
    expect(bob.received[0]).toMatchObject({
      type: 'multiplayer:leave',
      userId: 'alice',
      clientId: 'cA',
    })
  })

  it('rewrites spoofed presence user.id to the bound identity', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    // Alice impersonates Bob in a presence frame.
    await hooks.message(alice, presence('room', 'bob', 'cA'))

    expect(bob.received).toHaveLength(1)
    expect(bob.received[0].user.id).toBe('alice')
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

    expect(bob.received[0].clientId).toBe('cA')
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

    expect(bob.received[0].userId).toBe('server-verified')
  })

  it('broadcasts the bound identity on disconnect', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    // Alice later claims to be Bob — must not affect the bound identity.
    await hooks.message(alice, frame({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'bob',
      clientId: 'cB',
      data: {},
    }))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    bob.received.length = 0

    hooks.close(alice)

    expect(bob.received).toHaveLength(1)
    expect(bob.received[0]).toMatchObject({
      type: 'multiplayer:leave',
      userId: 'alice',
      clientId: 'cA',
    })
  })
})

describe('ws-handler upgrade origin check', () => {
  beforeEach(() => {
    // Silence the missing-authorize-hook warning in origin-focused tests.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
