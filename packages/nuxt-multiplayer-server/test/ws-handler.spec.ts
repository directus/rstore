import type { Peer } from 'crossws'
import type { MultiplayerServerHandlerOptions } from '../src/runtime/server/ws-handler'
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

function makeHandler(options: Partial<MultiplayerServerHandlerOptions> = {}): WsHooks {
  const handler = createMultiplayerWebSocketHandler({
    maxRoomSize: 10,
    maxMessageBytes: 64 * 1024,
    rateLimit: null,
    ...options,
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

describe('ws-handler wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards text frames and closes to the room server', async () => {
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    await hooks.message(bob, presence('room', 'bob', 'cB'))
    hooks.close(alice)

    expect(alice.received.map(frame => frame.type)).toEqual(['multiplayer:presence'])
    expect(bob.received).toEqual([{ type: 'multiplayer:leave', roomId: 'room', userId: 'alice', clientId: 'cA' }])
  })

  it.each([
    ['maxRoomSize', { maxRoomSize: 1 }, presence('room', 'bob', 'cB')],
    ['maxMessageBytes', { maxMessageBytes: 120 }, presence('room', 'bob'.repeat(20), 'cB')],
    ['rateLimit', { rateLimit: { capacity: 1, refillPerSecond: 0 } }, presence('room', 'bob', 'cB')],
  ] as const)('applies the %s option', async (_name, options, secondFrame) => {
    const hooks = makeHandler(options)
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, presence('room', 'alice', 'cA'))
    // Bob's frame is refused, or (rate limit) Alice's second one is dropped.
    await hooks.message(bob, secondFrame)
    await hooks.message(alice, presence('room', 'alice', 'cA'))

    expect(bob.received).toEqual([])
  })

  it('calls the handlers registered on rstoreMultiplayerServerHooks with the crossws peer', async () => {
    const peers: unknown[] = []
    const dispose = rstoreMultiplayerServerHooks.hook('multiplayer.authorize', (payload) => {
      peers.push(payload.peer)
      payload.setUserId('server-verified')
    })
    try {
      const hooks = makeHandler()
      const alice = makePeer('pA')
      const bob = makePeer('pB')

      await hooks.message(bob, presence('room', 'bob', 'cB'))
      await hooks.message(alice, presence('room', 'spoofed-id', 'cA'))

      expect(peers).toEqual([bob, alice])
      expect(bob.received[0].user.id).toBe('server-verified')
    }
    finally {
      dispose()
    }
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
