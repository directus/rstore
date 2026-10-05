import type { Peer } from 'crossws'
import type { MultiplayerServerHandlerOptions } from '../src/runtime/server/ws-handler'
import { createMemoryOpLogStore } from '@rstore/multiplayer/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineRstoreCollab, useRstoreCollabServer } from '../src/runtime/server/collab'
import { createMultiplayerWebSocketHandler } from '../src/runtime/server/ws-handler'

/** crossws-like hook surface extracted from the h3 handler. */
interface WsHooks {
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
    maxMessageBytes: 1024,
    rateLimit: null,
    collab: { maxMessageBytes: 64 * 1024, rateLimit: null },
    ...options,
  })
  return (handler as any).__websocket__ as WsHooks
}

function frame(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload)
  return { text: () => text }
}

const node = { id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [{ insert: 'hello' }], deleted: false, version: 0 }
const hello = (clientId: string) => frame({ type: 'collab:hello', docId: 'doc', clientId, protocols: [2], ch: 1 })

/** A collab sequencer over a seeded memory store, authorizing with the crossws peer id. */
function setupCollab() {
  const store = createMemoryOpLogStore()
  store.seed('doc', [node], 0)
  const authorized: unknown[] = []
  defineRstoreCollab({
    store,
    hooks: {
      authorize: ({ peer }) => {
        authorized.push(peer.ws)
        return { userId: `user-${peer.ws.id}` }
      },
    },
  })
  return { store, authorized }
}

describe('collab documents on the multiplayer endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes collab frames to the sequencer configured with defineRstoreCollab', async () => {
    const { store, authorized } = setupCollab()
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')

    await hooks.message(alice, hello('cA'))
    await hooks.message(bob, hello('cB'))
    expect(authorized).toEqual([alice, bob])
    expect(alice.received.map(f => f.type)).toEqual(['collab:welcome', 'collab:snapshot'])

    await hooks.message(alice, frame({ type: 'collab:submit', ch: 1, seq: 1, baseVersion: 0, ops: [{ t: 'text', node: 'p1', ops: [{ insert: '>' }] }] }))
    expect(alice.received.at(-1)).toEqual({ type: 'collab:ack', ch: 1, seq: 1, version: 1 })
    expect(bob.received.at(-1)).toMatchObject({ type: 'collab:ops', version: 1, clientId: 'cA', userId: 'user-pA' })
    expect(store.state('doc').nodes.get('p1')!.content).toEqual([{ insert: '>hello' }])

    // A closed peer leaves its documents.
    hooks.close(bob)
    await hooks.message(alice, frame({ type: 'collab:submit', ch: 1, seq: 2, baseVersion: 1, ops: [{ t: 'text', node: 'p1', ops: [{ insert: '>' }] }] }))
    expect(bob.received.at(-1)).toMatchObject({ version: 1 })
  })

  it('keeps room frames on the room server', async () => {
    setupCollab()
    const hooks = makeHandler()
    const alice = makePeer('pA')
    const bob = makePeer('pB')
    const presence = (clientId: string, id: string) => frame({ type: 'multiplayer:presence', roomId: 'room', clientId, user: { id, name: id, color: '#fff' } })
    await hooks.message(alice, presence('cA', 'alice'))
    await hooks.message(bob, presence('cB', 'bob'))
    expect(alice.received.map(f => f.type)).toEqual(['multiplayer:presence'])
  })

  it('ignores collab frames when collab is disabled', async () => {
    setupCollab()
    const hooks = makeHandler({ collab: null })
    const alice = makePeer('pA')
    await hooks.message(alice, hello('cA'))
    expect(alice.received).toEqual([])
  })

  it('applies the collab size and rate limits', async () => {
    setupCollab()
    const big = makeHandler({ collab: { maxMessageBytes: 40, rateLimit: null } })
    const alice = makePeer('pA')
    await big.message(alice, hello('cA'))
    expect(alice.received).toEqual([])

    const limited = makeHandler({ collab: { maxMessageBytes: 64 * 1024, rateLimit: { capacity: 1, refillPerSecond: 0 } } })
    const bob = makePeer('pB')
    await limited.message(bob, hello('cB'))
    await limited.message(bob, frame({ type: 'collab:submit', ch: 1, seq: 1, baseVersion: 0, ops: [] }))
    expect(bob.received.map(f => f.type)).toEqual(['collab:welcome', 'collab:snapshot'])
  })

  it('exposes the sequencer for server-authored ops', async () => {
    const { store } = setupCollab()
    const result = await useRstoreCollabServer().submitServer('doc', [{ t: 'text', node: 'p1', ops: [{ retain: 5 }, { insert: '!' }] }])
    expect(result.version).toBe(1)
    expect(store.state('doc').nodes.get('p1')!.content).toEqual([{ insert: 'hello!' }])
  })
})
