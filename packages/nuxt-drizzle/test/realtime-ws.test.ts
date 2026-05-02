import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Virtual modules populated at build time by the Nuxt module. We stub them
// so the realtime handler can import cleanly in the test environment.
vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'postgresql',
}))

// The realtime handler is an h3 `defineWebSocketHandler(hooks)` — the
// returned value is an event handler with `websocket: hooks`. We pull the
// hooks out and invoke them with fake peers to exercise the logic.
interface FakePeer {
  id: string
  context: Record<string, unknown>
  sent: any[]
  send: (payload: any) => void
  /**
   * Optional close stub. The realtime handler calls this on protocol
   * rejections, so version-negotiation tests need to capture the call.
   */
  close?: (code?: number, reason?: string) => void
}

function makePeer(id = 'peer-1'): FakePeer {
  const sent: any[] = []
  return {
    id,
    context: {},
    sent,
    send: (payload: any) => {
      sent.push(payload)
    },
  }
}

function makeMessage(payload: unknown) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return {
    text: () => raw,
    json: () => (typeof payload === 'object' ? payload : JSON.parse(raw)),
  }
}

async function getHooks() {
  const handlerModule = await import('../src/runtime/server/api/realtime.ws')
  const handler: any = handlerModule.default
  return handler.__websocket__ ?? handler.websocket ?? handler
}

/**
 * Poll a predicate until it returns truthy or the timeout expires. Used in
 * place of arbitrary `setTimeout` sleeps so tests don't flake on slow CI:
 * the assertion runs as soon as the async pubsub fanout + microtask flush
 * lands its frame on the peer.
 */
async function waitFor<T>(
  predicate: () => T | undefined,
  { timeoutMs = 500, intervalMs = 1 }: { timeoutMs?: number, intervalMs?: number } = {},
): Promise<T> {
  const start = Date.now()
  while (true) {
    const result = predicate()
    if (result) {
      return result
    }
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`waitFor: predicate did not become truthy within ${timeoutMs}ms`)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

/**
 * Asserts that nothing matching `predicate` arrives within the settle
 * window. Use to verify the *absence* of a frame after the async pubsub
 * pipeline has had time to flush — pairs with `waitFor` for positive cases.
 */
async function expectNoMatch<T>(
  predicate: () => T | undefined,
  { settleMs = 50 }: { settleMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + settleMs
  while (Date.now() < deadline) {
    if (predicate()) {
      throw new Error('expectNoMatch: predicate matched unexpectedly')
    }
    await new Promise(r => setTimeout(r, 5))
  }
}

describe('realtime.ws handler', () => {
  let pubsubModule: typeof import('../src/runtime/server/utils/pubsub')
  let hooksModule: typeof import('../src/runtime/server/utils/hooks')

  beforeEach(async () => {
    vi.resetModules()
    pubsubModule = await import('../src/runtime/server/utils/pubsub')
    hooksModule = await import('../src/runtime/server/utils/hooks')
    pubsubModule.setPubSub(pubsubModule.createMemoryPubSub())
  })

  afterEach(() => {
    // Clear hook handlers between tests so authorize/filter registrations
    // from one test do not leak into the next.
    ;(hooksModule.rstoreDrizzleHooks as any)._hooks = {}
  })

  it('sends init ack on open and binds header-provided clientId', async () => {
    const hooks = await getHooks()
    const peer = makePeer()

    hooks.upgrade?.({
      headers: new Map([['x-rstore-client-id', 'client-abc']]) as unknown as Headers,
      context: peer.context,
    })
    // Ensure upgrade helpers tolerate the Map-as-Headers shim — the handler
    // only calls `.get(name)`, which Map supports.
    hooks.open(peer)
    expect(peer.sent).toHaveLength(1)
    expect(peer.sent[0]).toMatchObject({ init: { ok: true } })
  })

  it('binds clientId from explicit init frame', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooks.open(peer)
    expect(peer.sent).toHaveLength(0)
    await hooks.message(peer, makeMessage({ init: { clientId: 'client-xyz', v: 2 } }))
    // Ack is sent only after the peer's clientId has actually been registered.
    expect(peer.sent).toHaveLength(1)
    expect(peer.sent[0]).toMatchObject({ init: { ok: true, v: 2 } })
  })

  it('drops non-JSON and ping messages safely', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooks.open(peer)
    await hooks.message(peer, {
      text: () => 'ping',
      json: () => { throw new Error('not json') },
    })
    // Ping gets a pong back, but that's the ONLY extra send.
    expect(peer.sent.filter(s => s === 'pong')).toHaveLength(1)

    await hooks.message(peer, {
      text: () => 'not-json',
      json: () => { throw new Error('not json') },
    })
    // Still just the pong — no init ack is sent before explicit init.
    expect(peer.sent).toHaveLength(1)
  })

  it('suppresses echo to the origin clientId', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooks.open(peer)
    await hooks.message(peer, makeMessage({ init: { clientId: 'me' } }))
    await hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
      originClientId: 'me',
    })
    // After the async pubsub fanout settles, the peer must NOT have
    // received an echo of its own publish.
    await expectNoMatch(() => peer.sent.find((s: any) => s && typeof s === 'object' && 'update' in s))
  })

  it('does not ack before explicit init when no header-bound clientId exists', async () => {
    const hooks = await getHooks()
    const peer = makePeer()

    hooks.open(peer)
    expect(peer.sent).toHaveLength(0)

    await hooks.message(peer, makeMessage({ init: { clientId: 'late-bind', v: 2 } }))
    expect(peer.sent).toHaveLength(1)
    expect(peer.sent[0]).toMatchObject({ init: { ok: true, v: 2 } })
  })

  it('rejects unauthorized subscribe and sends rejected frame', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooksModule.rstoreDrizzleHooks.hook('realtime.authorize', ({ reject }) => {
      reject('nope')
    })
    hooks.open(peer)
    await hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    const rejected = peer.sent.find((s: any) => s?.subscription?.action === 'rejected')
    expect(rejected).toBeTruthy()
    expect(rejected.subscription.reason).toBe('nope')
  })

  it('isolates throwing filter handlers from other peers', async () => {
    const hooks = await getHooks()
    const peerA = makePeer('a')
    const peerB = makePeer('b')
    let calls = 0
    hooksModule.rstoreDrizzleHooks.hook('realtime.filter', ({ peer: p }) => {
      calls++
      if ((p as any).id === 'a') {
        throw new Error('boom')
      }
    })
    hooks.open(peerA)
    hooks.open(peerB)
    await hooks.message(peerA, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    await hooks.message(peerB, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })
    // peerA's fanout threw — peerB still receives the batched update frame.
    const bUpdate = await waitFor(() => peerB.sent.find((s: any) => s?.update || s?.updates))
    spy.mockRestore()
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(bUpdate).toBeTruthy()
    // peerA must not have received the frame, despite being subscribed.
    expect(peerA.sent.find((s: any) => s?.update || s?.updates)).toBeUndefined()
  })

  it('batches multiple back-to-back publishes into a single updates frame', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooks.open(peer)
    await hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    const pubsub = pubsubModule.getPubSub()
    pubsub.publish('update', { type: 'created', collection: 'todos', key: undefined as any, record: { id: 1 } })
    pubsub.publish('update', { type: 'created', collection: 'todos', key: undefined as any, record: { id: 2 } })
    pubsub.publish('update', { type: 'created', collection: 'todos', key: undefined as any, record: { id: 3 } })
    const batched = await waitFor(() => peer.sent.find((s: any) => Array.isArray(s?.updates)))
    expect(batched.updates).toHaveLength(3)
    // Verify the records are intact and in publish order.
    expect(batched.updates.map((u: any) => u.record.id)).toEqual([1, 2, 3])
  })

  describe('protocol version negotiation', () => {
    it('accepts a client whose v matches the server', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      await hooks.message(peer, makeMessage({ init: { clientId: 'c', v: 2 } }))
      expect(peer.sent[0]).toMatchObject({ init: { ok: true, v: 2 } })
      expect(peer.close).toBeUndefined()
    })

    it('accepts a legacy client that omits v', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      await hooks.message(peer, makeMessage({ init: { clientId: 'c' } }))
      const ack = peer.sent.find((s: any) => s?.init?.ok)
      expect(ack).toBeTruthy()
    })

    it('rejects a client whose v is newer than the server can speak', async () => {
      const hooks = await getHooks()
      const closeCalls: any[] = []
      const peer = {
        ...makePeer(),
        close: (code?: number, reason?: string) => closeCalls.push({ code, reason }),
      }
      hooks.open(peer)
      await hooks.message(peer, makeMessage({ init: { clientId: 'c', v: 999 } }))

      const errorAck = peer.sent.find((s: any) => s?.init && s.init.ok === false)
      expect(errorAck).toBeTruthy()
      expect(errorAck.init).toMatchObject({
        ok: false,
        error: 'unsupported-version',
        v: 2,
      })
      expect(closeCalls.length).toBeGreaterThan(0)
    })

    it('does not register subscriptions after a version rejection', async () => {
      const hooks = await getHooks()
      const peer = {
        ...makePeer(),
        close: () => {},
      }
      hooks.open(peer)
      await hooks.message(peer, makeMessage({ init: { clientId: 'c', v: 999 } }))
      // Even if the client sends a follow-up subscribe (e.g. before it
      // processes the close), the server must not forward updates to it.
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
      })
      await expectNoMatch(() => peer.sent.find((s: any) => s?.update || s?.updates))
    })
  })

  it('detaches per-peer pubsub listener when last subscription is removed', async () => {
    const hooks = await getHooks()
    const peer = makePeer()
    hooks.open(peer)
    await hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))
    await hooks.message(peer, makeMessage({
      subscription: { action: 'unsubscribe', collection: 'todos' },
    }))
    peer.sent.length = 0
    pubsubModule.getPubSub().publish('update', {
      type: 'created',
      collection: 'todos',
      key: undefined as any,
      record: { id: 1 },
    })
    await expectNoMatch(() => peer.sent.find((s: any) => s?.update || s?.updates))
  })

  describe('echo suppression edge cases', () => {
    it('does not suppress when payload originClientId is undefined', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      await hooks.message(peer, makeMessage({ init: { clientId: 'me' } }))
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      // Publisher didn't tag the frame — peer must receive it.
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
      })
      await waitFor(() => peer.sent.find((s: any) => s?.update || s?.updates))
    })

    it('does not suppress when peer has no clientId yet', async () => {
      // Peer never sent an init frame — nothing to compare against, so the
      // server must deliver every matching update.
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
        originClientId: 'someone-else',
      })
      await waitFor(() => peer.sent.find((s: any) => s?.update || s?.updates))
    })

    it('only suppresses for the matching clientId, not other peers', async () => {
      const hooks = await getHooks()
      const me = makePeer('me-peer')
      const other = makePeer('other-peer')
      hooks.open(me)
      hooks.open(other)
      await hooks.message(me, makeMessage({ init: { clientId: 'me' } }))
      await hooks.message(other, makeMessage({ init: { clientId: 'other' } }))
      await hooks.message(me, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      await hooks.message(other, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))

      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
        originClientId: 'me',
      })

      // `other` sees the update.
      await waitFor(() => other.sent.find((s: any) => s?.update || s?.updates))
      // `me` does not.
      expect(me.sent.find((s: any) => s?.update || s?.updates)).toBeUndefined()
    })
  })

  describe('subscription rejection state', () => {
    it('does not deliver updates to a rejected subscription', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooksModule.rstoreDrizzleHooks.hook('realtime.authorize', ({ reject }) => {
        reject('nope')
      })
      hooks.open(peer)
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      // Rejection frame already in peer.sent; clear so the next assertion
      // is unambiguous.
      peer.sent.length = 0
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
      })
      await expectNoMatch(() => peer.sent.find((s: any) => s?.update || s?.updates))
    })

    it('lets a peer re-subscribe to the same collection after rejection if policy allows', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      let allow = false
      hooksModule.rstoreDrizzleHooks.hook('realtime.authorize', ({ reject }) => {
        if (!allow)
          reject('not yet')
      })
      hooks.open(peer)
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      expect(peer.sent.find((s: any) => s?.subscription?.action === 'rejected')).toBeTruthy()

      // Flip the auth flag (simulating a session change) and try again.
      allow = true
      peer.sent.length = 0
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
      })
      await waitFor(() => peer.sent.find((s: any) => s?.update || s?.updates))
    })

    it('survives a throwing authorize hook by treating it as a rejection', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooksModule.rstoreDrizzleHooks.hook('realtime.authorize', () => {
        throw new Error('hook bug')
      })
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      hooks.open(peer)
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      spy.mockRestore()
      const rejection = peer.sent.find((s: any) => s?.subscription?.action === 'rejected')
      expect(rejection).toBeTruthy()
      expect(rejection.subscription.reason).toBe('authorize-error')
    })
  })

  describe('robustness', () => {
    it('drops a frame whose JSON parse throws', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      const before = peer.sent.length
      await hooks.message(peer, {
        text: () => '{"truncated":',
        json: () => { throw new SyntaxError('unexpected end') },
      })
      expect(peer.sent.length).toBe(before)
    })

    it('ignores a frame with no subscription and no init', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      const before = peer.sent.length
      await hooks.message(peer, makeMessage({ unknown: 'payload' }))
      // Server must silently drop unrecognized frames — neither send nor crash.
      expect(peer.sent.length).toBe(before)
    })

    it('handles a close before init without leaving state behind', async () => {
      const hooks = await getHooks()
      const peer = makePeer('disconnect-early')
      hooks.open(peer)
      // Close immediately, before the client sends an init frame.
      hooks.close(peer)
      // A second close must be safe (idempotent).
      expect(() => hooks.close(peer)).not.toThrow()
    })

    it('treats a duplicate subscribe as idempotent', async () => {
      const hooks = await getHooks()
      const peer = makePeer()
      hooks.open(peer)
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      const beforeLen = peer.sent.length
      await hooks.message(peer, makeMessage({
        subscription: { action: 'subscribe', collection: 'todos' },
      }))
      // No duplicate frames produced from a duplicate subscribe.
      expect(peer.sent.length).toBe(beforeLen)

      pubsubModule.getPubSub().publish('update', {
        type: 'created',
        collection: 'todos',
        key: undefined as any,
        record: { id: 1 },
      })
      // Only ONE update is delivered, not two.
      const updateFrame = await waitFor(() => peer.sent.find((s: any) => s?.update || s?.updates))
      expect(updateFrame).toBeTruthy()
      // Wait for additional flushes — there should not be a second copy.
      await expectNoMatch(() => {
        const updates = peer.sent.filter((s: any) => s?.update || s?.updates)
        return updates.length > 1 ? updates : undefined
      })
    })
  })
})
