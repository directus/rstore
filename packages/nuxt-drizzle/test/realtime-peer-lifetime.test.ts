import type { RstoreDrizzlePubSub } from '../src/runtime/server/utils/pubsub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { expectNoMatch, getWsHooks, makeMessage, makePeer } from './utils/ws'

// Virtual module populated at build time by the Nuxt module.
vi.mock('$rstore-drizzle-server-utils.js', () => ({
  dialect: 'postgresql',
}))

/** In-memory pubsub that also reports how many listeners are still attached. */
interface CountingPubSub extends RstoreDrizzlePubSub {
  /** Number of `subscribe` calls whose teardown has not run yet. */
  liveSubscribers: () => number
}

/**
 * Wraps the real memory pubsub so a test can observe listener leaks: every
 * peer listener that outlives its peer stays counted here.
 *
 * @param inner Real pubsub doing the actual delivery.
 */
function createCountingPubSub(inner: RstoreDrizzlePubSub): CountingPubSub {
  let live = 0
  return {
    publish: inner.publish,
    subscribe(channel, callback) {
      const off = inner.subscribe(channel, callback)
      live++
      let released = false
      return () => {
        if (!released) {
          released = true
          live--
        }
        off()
      }
    },
    liveSubscribers: () => live,
  }
}

describe('realtime peer listener lifetime', () => {
  let pubsubModule: typeof import('../src/runtime/server/utils/pubsub')
  let hooksModule: typeof import('../src/runtime/server/utils/hooks')
  let pubsub: CountingPubSub
  let authorized: ReturnType<typeof createDeferred<void>>

  beforeEach(async () => {
    vi.resetModules()
    pubsubModule = await import('../src/runtime/server/utils/pubsub')
    hooksModule = await import('../src/runtime/server/utils/hooks')
    pubsub = createCountingPubSub(pubsubModule.createMemoryPubSub())
    pubsubModule.setPubSub(pubsub)
    // Hold every authorize call until the test releases it.
    authorized = createDeferred<void>()
    hooksModule.rstoreDrizzleHooks.hook('realtime.authorize', () => authorized.promise)
  })

  afterEach(() => {
    ;(hooksModule.rstoreDrizzleHooks as any)._hooks = {}
  })

  it('does not attach a pubsub listener for a peer that closed during authorize', async () => {
    const hooks = await getWsHooks()
    const peer = makePeer()
    hooks.open(peer)
    const subscribing = hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', collection: 'todos' },
    }))

    hooks.close(peer)
    authorized.resolve()
    await subscribing

    expect(pubsub.liveSubscribers()).toBe(0)
  })

  it('drops a subscription unsubscribed before its authorize resolves', async () => {
    const hooks = await getWsHooks()
    const peer = makePeer()
    hooks.open(peer)
    const subscription = { collection: 'todos' }
    const subscribing = hooks.message(peer, makeMessage({
      subscription: { action: 'subscribe', ...subscription },
    }))
    await hooks.message(peer, makeMessage({
      subscription: { action: 'unsubscribe', ...subscription },
    }))

    authorized.resolve()
    await subscribing

    expect(pubsub.liveSubscribers()).toBe(0)
    pubsub.publish('update', { type: 'created', collection: 'todos', key: '1', record: { id: 1 } })
    await expectNoMatch(() => peer.sent.find((frame: any) => frame?.update || frame?.updates))
  })

  it('still subscribes when the same subscription is requested again after unsubscribe', async () => {
    const hooks = await getWsHooks()
    const peer = makePeer()
    hooks.open(peer)
    const subscribe = makeMessage({ subscription: { action: 'subscribe', collection: 'todos' } })
    const first = hooks.message(peer, subscribe)
    await hooks.message(peer, makeMessage({ subscription: { action: 'unsubscribe', collection: 'todos' } }))
    const second = hooks.message(peer, subscribe)

    authorized.resolve()
    await Promise.all([first, second])

    expect(pubsub.liveSubscribers()).toBe(1)
  })

  it('detaches pubsub listeners of peers force-closed on shutdown', async () => {
    const hooks = await getWsHooks()
    const handlerModule = await import('../src/runtime/server/realtime/handler')
    const peer = makePeer()
    hooks.open(peer)
    authorized.resolve()
    await hooks.message(peer, makeMessage({ subscription: { action: 'subscribe', collection: 'todos' } }))
    expect(pubsub.liveSubscribers()).toBe(1)

    // The fake peer has no close/terminate, like a socket whose crossws
    // `close` hook never fires after shutdown.
    handlerModule.closeAllRstoreDrizzlePeers()

    expect(pubsub.liveSubscribers()).toBe(0)
  })
})
