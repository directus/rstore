import { createCoreStack } from '#test-utils/store/coreStack'
import * as v from 'valibot'
import { describe, expect, it, onTestFinished } from 'vitest'
import { ActionSchema, CacheRequestSchema, DevtoolsError, HistoryRequestSchema, RuntimeInvalidationSchema, TargetSchema, validateReadResult, WatchRequestSchema } from '../src/protocol'
import { createRstoreDevtools } from '../src/runtime'

/** Exercise schemas used by every transport; malformed input must never reach stores. */
describe('devtools protocol argument boundaries', () => {
  const target = { sessionId: 'browser-1', storeId: 'default', generation: 1 }
  const envelope = { target, commandId: 'command-1', issuedAt: Date.now() }

  it('preserves valid zero and empty-string keys while rejecting invalid identities', () => {
    for (const key of [0, '']) {
      expect(v.parse(ActionSchema, { ...envelope, action: 'delete-item', collection: 'tasks', key })).toMatchObject({ key })
    }
    expect(v.safeParse(TargetSchema, { ...target, generation: 0 }).success).toBe(false)
    expect(v.safeParse(TargetSchema, { ...target, sessionId: '' }).success).toBe(false)
    expect(v.safeParse(ActionSchema, { ...envelope, action: 'delete-item', collection: 'tasks', key: Infinity }).success).toBe(false)
  })

  it('defaults pagination but rejects silent clamping and ambiguous history cursors', () => {
    expect(v.parse(CacheRequestSchema, { target, collection: 'tasks' }).page).toEqual({ offset: 0, limit: 100 })
    for (const page of [{ offset: -1, limit: 10 }, { offset: 0.5, limit: 10 }, { offset: 0, limit: 501 }, { offset: 0, limit: 0 }]) {
      expect(v.safeParse(CacheRequestSchema, { target, collection: 'tasks', page }).success).toBe(false)
    }
    expect(v.safeParse(HistoryRequestSchema, { target, beforeSequence: 3, afterSequence: 1 }).success).toBe(false)
  })

  it('requires CRUD fields and distinguishes cache writes from collection updates', () => {
    const item = { id: 'task-1', title: 'next', nested: [null, false, 42] }
    expect(v.parse(ActionSchema, { ...envelope, action: 'write-cache-item', collection: 'tasks', item }).action).toBe('write-cache-item')
    expect(v.safeParse(ActionSchema, { ...envelope, action: 'update-item', collection: 'tasks', item }).success).toBe(false)
    expect(v.safeParse(ActionSchema, { ...envelope, action: 'create-item', item }).success).toBe(false)
  })

  it('rejects executable, cyclic, preview, and unsafe inputs without invoking getters', () => {
    let reads = 0
    const getter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        reads++
        return 'secret'
      },
    })
    const cycle: Record<string, unknown> = {}
    cycle.child = cycle
    const invalid = [getter, cycle, { callback: () => 1 }, { n: Number.NaN }, { $rstorePreview: 'object', entries: [] }, { kind: 'object', entries: [] }, JSON.parse('{"__proto__":{}}'), { nested: { constructor: {} } }]
    for (const item of invalid) {
      expect(v.safeParse(ActionSchema, { ...envelope, action: 'create-item', collection: 'tasks', item }).success).toBe(false)
    }
    expect(reads).toBe(0)
    const hostileEnvelope = Object.defineProperty({ ...envelope }, 'action', {
      enumerable: true,
      get() {
        reads++
        return 'clear-cache'
      },
    })
    expect(v.safeParse(ActionSchema, hostileEnvelope).success).toBe(false)
    expect(reads).toBe(0)
    const child = { title: 'same value in two JSON fields' }
    expect(v.safeParse(ActionSchema, { ...envelope, action: 'create-item', collection: 'tasks', item: { first: child, second: child } }).success).toBe(true)
  })

  it('bounds traversal and encoded action size before store dispatch', () => {
    let deep: unknown = 'leaf'
    for (let depth = 0; depth < 12; depth++) deep = { nested: deep }
    for (const item of [{ text: 'é'.repeat(17000) }, { entries: Array.from({ length: 1001 }, () => 0) }, { deep }]) {
      expect(v.safeParse(ActionSchema, { ...envelope, action: 'create-item', collection: 'tasks', item }).success).toBe(false)
    }
  })

  it('validates bounded typed read replies and fences mismatched target generations', () => {
    const cache = { target, revision: 2, truncated: false, data: { rows: [{ key: 0, value: { kind: 'object', entries: [['title', 'Saved']] } }], total: 1, matchingTotal: 1, offset: 0, limit: 100, scanTruncated: false } }
    expect(validateReadResult('rstore:get-cache', cache, target)).toEqual(cache)
    expect(validateReadResult('rstore:get-cache', { ...cache, data: null, unavailable: 'Custom cache lacks inspection' }, target).data).toBeNull()
    for (const invalid of [{ ...cache, revision: -1 }, { ...cache, data: { ...cache.data, limit: 501 } }, { ...cache, data: { ...cache.data, rows: [{ key: 0, value: { kind: 'reference' } }] } }, { ...cache, data: null }, { ...cache, data: { ...cache.data, total: -1 } }]) {
      expect(() => validateReadResult('rstore:get-cache', invalid, target)).toThrow(DevtoolsError)
    }
    expect(() => validateReadResult('rstore:get-cache', { ...cache, target: { ...target, generation: 2 } }, target)).toThrow('Read reply target differs from requested target')
    const hostile = Object.defineProperty({ ...cache }, 'data', {
      enumerable: true,
      get() {
        throw new Error('Getter invoked')
      },
    })
    expect(() => validateReadResult('rstore:get-cache', hostile, target)).toThrow('Invalid read reply')
    expect(() => validateReadResult('rstore:get-modules', { ...cache, data: [{ name: 'large', value: 'x'.repeat(512 * 1024) }] }, target)).toThrow('Invalid read reply')
  })

  it('rejects malformed session/store discovery and accepts real summary metadata', () => {
    const capabilities = { cacheInspection: true, moduleObservation: true, cacheWrites: false, backendMutations: false, readOnly: true }
    const store = { target, label: 'Default', capabilities }
    const sessions = [{ sessionId: target.sessionId, kind: 'browser', label: 'Application', connected: true, completed: false, startedAt: 10, stores: [store] }]
    expect(validateReadResult('rstore:list-sessions', sessions)).toEqual(sessions)
    expect(validateReadResult('rstore:list-stores', [store])).toEqual([store])
    expect(() => validateReadResult('rstore:list-stores', [{ ...store, capabilities: { readOnly: true } }])).toThrow(DevtoolsError)
  })

  it('validates observation authority and detached revision notifications', () => {
    expect(v.parse(WatchRequestSchema, { target, view: 'modules' })).toEqual({ target, view: 'modules' })
    expect(v.safeParse(WatchRequestSchema, { target: { ...target, generation: 0 }, view: 'modules' }).success).toBe(false)
    expect(v.safeParse(WatchRequestSchema, { target, view: 'registry' }).success).toBe(false)
    expect(v.parse(RuntimeInvalidationSchema, { view: 'registry', revision: 0 })).toEqual({ view: 'registry', revision: 0 })
    expect(v.safeParse(RuntimeInvalidationSchema, { target, view: 'cache', revision: -1 }).success).toBe(false)
    expect(v.safeParse(RuntimeInvalidationSchema, { target, view: 'eval', revision: 1 }).success).toBe(false)
  })

  it('preserves safe active and failed SSR request metadata even before store initialization', () => {
    const activeRequest = { path: '/failed-init', method: 'GET', startedAt: 10, status: 'active' }
    const active = { sessionId: 'ssr-request', kind: 'ssr', label: 'GET /failed-init', connected: true, completed: false, startedAt: 10, stores: [], request: activeRequest }
    expect(validateReadResult('rstore:list-sessions', [active])[0]!.request).toEqual(activeRequest)
    const terminalRequest = { ...activeRequest, status: 'error', completedAt: 20, duration: 10, error: { kind: 'error', name: 'Error', message: 'Store initialization failed', entries: [] } }
    const terminal = { ...active, connected: false, completed: true, completedAt: 20, request: terminalRequest }
    for (const status of ['completed', 'error', 'aborted']) {
      const request = { ...terminalRequest, status }
      expect(validateReadResult('rstore:list-sessions', [{ ...terminal, request }])[0]!.request).toEqual(request)
    }
    expect(() => validateReadResult('rstore:list-sessions', [{ ...active, kind: 'browser' }])).toThrow('Invalid read reply')
    for (const request of [{ ...activeRequest, path: '/failed?token=secret' }, { ...activeRequest, method: 'GET\nsecret' }, { ...activeRequest, duration: -1 }, { ...activeRequest, status: 'completed' }, { ...activeRequest, error: new Error('raw error') }, { ...terminalRequest, error: { kind: 'error', message: 'incomplete preview' } }]) {
      expect(() => validateReadResult('rstore:list-sessions', [{ ...active, request }])).toThrow('Invalid read reply')
    }
  })

  it('accepts actual Core inspection replies for every view without changing capability policy', async () => {
    const runtime = createRstoreDevtools({ sessionId: 'schema-runtime' })
    onTestFinished(runtime.dispose)
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'tasks' }] })
    const registration = runtime.attachStore(stack.store, { id: 'default', readOnly: true })
    const target = registration.target
    const stores = validateReadResult('rstore:list-stores', runtime.read({ method: 'rstore:list-stores', sessionId: target.sessionId }))
    expect(stores[0]!.capabilities).toMatchObject({ readOnly: true, cacheWrites: false, backendMutations: false })
    expect(validateReadResult('rstore:list-sessions', runtime.read({ method: 'rstore:list-sessions' }))[0]!.stores).toEqual(stores)
    for (const method of ['rstore:get-collections', 'rstore:get-history', 'rstore:get-subscriptions', 'rstore:get-modules', 'rstore:get-plugins'] as const) {
      const reply = validateReadResult(method, runtime.read({ method, target }), target)
      expect(reply.target).toEqual(target)
      expect(reply.truncated).toBe(false)
    }
    const cache = validateReadResult('rstore:get-cache', runtime.read({ method: 'rstore:get-cache', target, collection: 'tasks' }), target)
    expect(cache.data).toMatchObject({ rows: [], total: 0, matchingTotal: 0, scanTruncated: false })
  })
})
