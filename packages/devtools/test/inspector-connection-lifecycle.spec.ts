import type { InspectorTransport } from '../app/transport/types'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createDeferred } from '../../../test/utils/deferred'
import { Inspector } from '../app/stores/connection'
import { useConnectionOwner } from '../app/stores/connection-owner'
import { createLifecycleRenderer } from './utils/lifecycle-renderer'

/** Real Vue lifecycle, without browser rendering or presentation assertions. */
function mountOwner(state: Inspector) {
  let owner!: ReturnType<typeof useConnectionOwner>
  const renderer = createLifecycleRenderer()
  const app = renderer.createApp(defineComponent({
    setup() {
      owner = useConnectionOwner(state)
      return () => h('div')
    },
  }))
  app.mount({})
  let mounted = true
  return { owner, unmount: () => {
    if (mounted)
      app.unmount()
    mounted = false
  } }
}

/** External producer endpoint records actual disposal of acquired resources. */
function endpoint() {
  let disposed = false
  const transport: InspectorTransport = {
    listSessions: async () => [],
    subscribe: () => () => {},
    read: async () => { throw new Error('No store') },
    action: async () => { throw new Error('No store') },
    dispose: () => { disposed = true },
  }
  return { transport, disposed: () => disposed }
}

// Acquisition/continuation ownership stays real; only external transport replies
// are controlled. Old completion must not alter a later shared-state consumer.
describe('inspector component connection lifetime', () => {
  it.each(['success', 'failure'] as const)('retires overlapping mounted owner late %s after replacement connects', async (outcome) => {
    const state = new Inspector()
    const old = mountOwner(state)
    const held = createDeferred<InspectorTransport>()
    const late = endpoint()
    const fresh = endpoint()
    const work = old.owner.connect(() => held.promise)
    const settled = work.then(value => ({ value }), error => ({ error }))
    const discovery = old.owner.capture()
    const current = mountOwner(state)
    try {
      await current.owner.connect(async () => fresh.transport)
      if (outcome === 'success')
        held.resolve(late.transport)
      else held.reject(new Error('Superseded connection failed'))
      const result = await settled
      expect(state.transport).toBe(fresh.transport)
      expect(state.status).toBe('live')
      expect(state.error).toBe('')
      expect(fresh.disposed()).toBe(false)
      expect(late.disposed()).toBe(outcome === 'success')
      expect(discovery()).toBe(false)
      expect(result).toEqual({ value: false })
      old.unmount()
      expect(state.transport).toBe(fresh.transport)
      expect(fresh.disposed()).toBe(false)
    }
    finally {
      old.unmount()
      current.unmount()
      state.disconnect()
    }
  })

  it('keeps replacement owner connected when previous component unmounts', async () => {
    const state = new Inspector()
    const old = mountOwner(state)
    const first = endpoint()
    const fresh = endpoint()
    await old.owner.connect(async () => first.transport)
    const current = mountOwner(state)
    try {
      await current.owner.connect(async () => fresh.transport)
      expect(first.disposed()).toBe(true)
      old.unmount()
      expect(state.transport).toBe(fresh.transport)
      expect(state.status).toBe('live')
      expect(fresh.disposed()).toBe(false)
      current.unmount()
      expect(fresh.disposed()).toBe(true)
      expect(state.status).toBe('disconnected')
    }
    finally {
      old.unmount()
      current.unmount()
      state.disconnect()
    }
  })

  it('retires discovery when component unmounts or newer connection starts', async () => {
    const state = new Inspector()
    const mounted = mountOwner(state)
    const discovery = mounted.owner.capture()
    const first = endpoint()
    try {
      await mounted.owner.connect(async () => first.transport)
      expect(discovery()).toBe(false)
      const current = mounted.owner.capture()
      mounted.unmount()
      expect(current()).toBe(false)
      expect(first.disposed()).toBe(true)
    }
    finally {
      mounted.unmount()
      state.disconnect()
    }
  })

  it.each(['success', 'failure'] as const)('retires late %s without replacing fresh owner or publishing stale failures', async (outcome) => {
    const state = new Inspector()
    const old = mountOwner(state)
    const held = createDeferred<InspectorTransport>()
    const late = endpoint()
    const fresh = endpoint()
    const work = old.owner.connect(() => held.promise)
    // Observe rejection immediately so a failing baseline cannot leak a rejection.
    const settled = work.then(value => ({ value }), error => ({ error }))
    old.unmount()
    const current = mountOwner(state)
    try {
      await current.owner.connect(async () => fresh.transport)
      if (outcome === 'success')
        held.resolve(late.transport)
      else held.reject(new Error('Old connection failed'))
      const result = await settled
      expect(state.transport).toBe(fresh.transport)
      expect(state.status).toBe('live')
      expect(state.error).toBe('')
      expect(fresh.disposed()).toBe(false)
      expect(late.disposed()).toBe(outcome === 'success')
      expect(result).toEqual({ value: false })
    }
    finally {
      current.unmount()
      state.disconnect()
    }
  })
})
