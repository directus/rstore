import { describe, expect, it, vi } from 'vitest'
import { createMemoryPubSub, getPubSub, setPubSub, usePeerPubSub } from '../src/runtime/server/utils/pubsub'

// The in-memory pubsub is the default used whenever the user hasn't wired
// Redis/NATS/etc. `usePeerPubSub` is the per-peer accounting wrapper — its
// `unsubscribeAll` is what keeps long-lived servers from leaking listeners.

describe('createMemoryPubSub', () => {
  it('delivers published payloads to every subscriber', () => {
    const pubsub = createMemoryPubSub()
    const a = vi.fn()
    const b = vi.fn()

    pubsub.subscribe('update', a)
    pubsub.subscribe('update', b)

    const payload = { type: 'created' as const, collection: 'todos', key: '1', record: { id: 1 } }
    pubsub.publish('update', payload)

    expect(a).toHaveBeenCalledWith(payload)
    expect(b).toHaveBeenCalledWith(payload)
  })

  it('unsubscribe teardown stops further delivery', () => {
    const pubsub = createMemoryPubSub()
    const cb = vi.fn()
    const off = pubsub.subscribe('update', cb)
    pubsub.publish('update', { type: 'created', collection: 'todos', key: '1', record: { id: 1 } })
    expect(cb).toHaveBeenCalledTimes(1)

    off()
    pubsub.publish('update', { type: 'created', collection: 'todos', key: '2', record: { id: 2 } })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('publishing to a channel with no subscribers is a no-op', () => {
    const pubsub = createMemoryPubSub()
    expect(() => pubsub.publish('update', { type: 'created', collection: 'x', key: '1', record: {} })).not.toThrow()
  })

  it('double-unsubscribe is idempotent', () => {
    const pubsub = createMemoryPubSub()
    const cb = vi.fn()
    const off = pubsub.subscribe('update', cb)
    off()
    // Calling teardown twice should not throw — indexOf returns -1 on the
    // second call and the implementation guards against that.
    expect(() => off()).not.toThrow()
  })
})

describe('getPubSub / setPubSub', () => {
  it('swaps the active instance', () => {
    const previous = getPubSub()
    try {
      const custom = createMemoryPubSub()
      setPubSub(custom)
      expect(getPubSub()).toBe(custom)
    }
    finally {
      // Restore the default so subsequent tests see a clean module state.
      setPubSub(previous)
    }
  })
})

describe('usePeerPubSub', () => {
  it('routes publish/subscribe through the active pubsub', () => {
    const peer = usePeerPubSub('peer-1')
    const cb = vi.fn()
    const off = peer.subscribe('update', cb)

    // Published via the peer helper, but any consumer on the underlying
    // pubsub should see it.
    const payload = { type: 'created' as const, collection: 'todos', key: '1', record: { id: 1 } }
    peer.publish('update', payload)
    expect(cb).toHaveBeenCalledWith(payload)

    off()
    peer.unsubscribeAll()
  })

  it('unsubscribeAll tears down every subscription tracked for the peer', () => {
    const pubsub = createMemoryPubSub()
    const previous = getPubSub()
    setPubSub(pubsub)
    try {
      const peer = usePeerPubSub('peer-teardown')
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      peer.subscribe('update', cb1)
      peer.subscribe('update', cb2)

      peer.unsubscribeAll()

      // After teardown, publishes must not reach either callback.
      pubsub.publish('update', { type: 'created', collection: 'todos', key: '1', record: { id: 1 } })
      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).not.toHaveBeenCalled()
    }
    finally {
      setPubSub(previous)
    }
  })

  it('unsubscribeAll on an unknown peer is a no-op', () => {
    const peer = usePeerPubSub('never-subscribed')
    expect(() => peer.unsubscribeAll()).not.toThrow()
  })
})
