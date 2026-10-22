import type { InspectorTransport } from '../app/transport/types'
import type { RuntimeInvalidation } from '../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { Inspector } from '../app/stores/connection'
import { Selection } from '../app/stores/selection'

// Pure ownership algorithm: a delayed old reply must not become new target data.
describe('inspector target ownership', () => {
  const first = { sessionId: 'browser', storeId: 'one', generation: 1 }
  const second = { sessionId: 'browser', storeId: 'two', generation: 1 }
  it('invalidates delayed replies and open editors after switching store', () => {
    const selection = new Selection()
    selection.select(first)
    const request = selection.capture()
    selection.select(second)
    expect(selection.owns(request)).toBe(false)
    expect(selection.target).toEqual(second)
    expect(selection.owns(selection.capture())).toBe(true)
  })
  it('never substitutes another mutation target when selected generation disappears', () => {
    const selection = new Selection()
    selection.select(first)
    const request = selection.capture()
    selection.reconcile([{ ...first, generation: 2 }, second])
    expect(selection.target).toBeNull()
    expect(selection.owns(request)).toBe(false)
    expect(selection.unavailable).toBe(true)
  })
  it('selects failed SSR session without stores and fences previous live reads and actions', async () => {
    const pending = createDeferred<any>()
    const started = createDeferred<void>()
    const inspector = new Inspector()
    inspector.sessions = [{ sessionId: 'failed-request', label: 'GET /failed', kind: 'ssr', connected: false, completed: true, startedAt: 1, completedAt: 2, stores: [], request: { path: '/failed', method: 'GET', startedAt: 1, completedAt: 2, duration: 1, status: 'error', error: { kind: 'error', name: 'Error', message: 'Initialization failed', entries: [] } } }]
    inspector.transport = { read: async () => {
      started.resolve()
      return pending.promise
    } } as InspectorTransport
    const oldRead = inspector.select(first)
    await started.promise
    await inspector.select(null, 'failed-request')
    expect(inspector.session?.request?.status).toBe('error')
    expect(inspector.selection.target).toBeNull()
    expect(inspector.actionDisabled).toBeTruthy()
    inspector.open('clear-cache')
    expect(inspector.draft).toBeNull()
    pending.resolve({ target: first, revision: 1, truncated: false, data: [] })
    await oldRead
    expect(inspector.reply).toBeNull()
  })
  it('keeps new store data when an earlier collection reply arrives after selection changed', async () => {
    // Complex async ownership algorithm only: controlled transport replies are
    // inputs, not proof of actual in-page transport or browser lifecycle.
    const pending = createDeferred<any>()
    const started = createDeferred<void>()
    const inspector = new Inspector()
    inspector.transport = {
      read: async (_view, target) => {
        if (target.storeId === 'one') {
          started.resolve()
          return pending.promise
        }
        return { target, revision: 1, truncated: false, data: [{ name: 'Second', virtual: false, relations: null, actions: [] }] }
      },
    } as InspectorTransport
    const oldRead = inspector.select(first)
    await started.promise
    await inspector.select(second)
    expect(inspector.reply?.data).toEqual([{ name: 'Second', virtual: false, relations: null, actions: [] }])
    pending.resolve({ target: first, revision: 1, truncated: false, data: [{ name: 'First', virtual: false, relations: null, actions: [] }] })
    await oldRead
    expect(inspector.collections.map(collection => collection.name)).toEqual(['Second'])
    expect(inspector.reply?.target).toEqual(second)
  })
  it('releases late hidden-tab lease even when user returned to same tab', async () => {
    const pending = createDeferred<() => void>()
    const started = createDeferred<void>()
    let modules = 0
    const released: string[] = []
    const inspector = new Inspector()
    inspector.selection.select(first)
    inspector.transport = {
      watch: async (_target, view) => {
        if (view === 'modules' && modules++ === 0) {
          started.resolve()
          return pending.promise
        }
        return () => {
          released.push(view)
        }
      },
      read: async (view, target) => ({ target, revision: 1, truncated: false, data: view === 'history'
        ? { entries: [], droppedCount: 0, nextSequence: 1 }
        : [{ name: 'Actual', value: 'current' }] }),
      dispose: () => {},
    } as InspectorTransport
    const oldLease = inspector.show('modules')
    await started.promise
    await inspector.show('history')
    await inspector.show('modules')
    pending.resolve(() => {
      released.push('old-modules')
    })
    await oldLease
    expect(released).toEqual(['history', 'old-modules'])
    expect(inspector.reply?.data).toEqual([{ name: 'Actual', value: 'current' }])
    inspector.disconnect()
    expect(released).toEqual(['history', 'old-modules', 'modules'])
  })
  it('handles rejected registry publication and ignores old connection failure after reconnect', async () => {
    // Controlled replies exercise publication ownership, not browser transport.
    const failed = createDeferred<any>()
    const stale = createDeferred<any>()
    let initialized = false
    let work = failed.promise
    let listener: ((event: RuntimeInvalidation) => void) | undefined
    const inspector = new Inspector()
    const transport: InspectorTransport = {
      listSessions: async () => {
        if (!initialized) {
          initialized = true
          return []
        }
        return work
      },
      subscribe(callback) {
        listener = callback
        return () => {}
      },
      dispose: () => {},
      read: async () => { throw new Error('No registered store') },
      action: async () => { throw new Error('No registered store') },
    }
    await inspector.connect(transport)
    listener!({ view: 'registry', revision: 1 })
    failed.reject(new Error('Relay closed'))
    await expect.poll(() => inspector.error).toBe('Relay closed')
    work = stale.promise
    listener!({ view: 'registry', revision: 2 })
    await inspector.connect({ ...transport, listSessions: async () => [] })
    stale.reject(new Error('Old connection failure'))
    await stale.promise.catch(() => {})
    await Promise.resolve()
    expect(inspector.error).toBe('')
    expect(inspector.status).toBe('live')
    inspector.disconnect()
  })
})
