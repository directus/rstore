import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'

describe('portable runtime lifecycle', () => {
  // Real Core hooks/cache run; shared remote fixture substitutes external DB.
  // Generation reuse and detached evidence reject stale authority/history leaks.
  it('records actual connector work and fences disposed generations', async () => {
    const runtime = createRstoreDevtools({ sessionId: 'runtime-test' })
    onTestFinished(runtime.dispose)
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: 'existing', title: 'Original' }] },
      plugins: [runtime.plugin({ id: 'default' })],
    })
    const target = runtime.listStores()[0]!.target
    await findMany({ store: stack.store, collection: stack.collection('todos') })
    await createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'new', title: 'New' } })
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['existing', 'new'])
    const history = runtime.read({ method: 'rstore:get-history', target, limit: 100 })
    expect(history.data.entries.map((entry: any) => `${entry.operation}:${entry.phase}`)).toContain('fetchMany:complete')
    expect(history.data.entries.map((entry: any) => `${entry.operation}:${entry.phase}`)).toContain('create:complete')
    stack.dispose()
    expect(runtime.listStores()).toEqual([])
    expect(() => runtime.resolve(target)).toThrow()
    const replacement = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const registration = runtime.attachStore(replacement.store, { id: 'default' })
    expect(registration.target.generation).toBe(target.generation + 1)
    expect(() => runtime.resolve(target)).toThrow()
  })

  it('rejects duplicate authority and isolates stores and throwing listeners', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const other = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    const separate = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    onTestFinished(separate.dispose)
    const first = runtime.attachStore(stack.store, { id: 'one' })
    const second = runtime.attachStore(other.store, { id: 'two' })
    const independent = separate.attachStore(stack.store, { id: 'one' })
    expect(() => runtime.attachStore(other.store, { id: 'one' })).toThrow()
    expect(() => runtime.attachStore(stack.store, { id: 'three' })).toThrow()
    runtime.subscribe(() => {
      throw new Error('observer broke')
    })
    await createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'item', title: 'Saved' } })
    expect(stack.remote.rows('todos')).toEqual([{ id: 'item', title: 'Saved' }])
    expect(first.history.page().entries.length).toBeGreaterThan(0)
    expect(second.history.page().entries).toEqual([])
    expect(independent.history.page().entries.length).toBeGreaterThan(0)
    first.dispose()
    await createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'another' } })
    expect(first.history.page().entries).toEqual([])
  })

  it('records connector failures without replacing rejection or breaking later work', async () => {
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id: 'default' })] })
    const target = runtime.listStores()[0]!.target
    const failure = new Error('Backend refused create')
    stack.remote.failNext('createItem', failure)
    await expect(createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'failed' } })).rejects.toBe(failure)
    expect(stack.remote.rows('todos')).toEqual([])
    const errors = runtime.read({ method: 'rstore:get-history', target }).data.entries.filter((entry: any) => entry.phase === 'error')
    expect(errors.map((entry: any) => entry.operation)).toEqual(['create'])
    expect(JSON.stringify(errors)).toContain('Backend refused create')
    await createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'success' } })
    expect(stack.remote.rows('todos')).toEqual([{ id: 'success' }])
  })

  it('releases registration despite an earlier throwing application disposal observer', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const failure = new Error('Application disposal failed')
    stack.store.$hooks.hook('dispose', () => {
      throw failure
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'default' })
    expect(() => stack.dispose()).toThrow(failure)
    expect(runtime.listStores()).toEqual([])
    expect(() => runtime.resolve(target)).toThrow('Store target unavailable')
    expect(() => stack.dispose()).not.toThrow()
  })

  it('keeps batch diagnostics bounded without reading tail descriptors or losing backend work', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], batching: { maxSize: 2000 }, batch: ['batch'] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    let diagnosticTailReads = 0
    let observedTailReads = -1
    let batchTruncated = false
    // Remote has completed real backend work when this observer runs. Measure
    // descriptor access strictly between real hooks bracketing instrumentation.
    stack.store.$hooks.hook('batch', ({ operations }) => {
      const tail = operations[1000]
      if (!tail)
        throw new Error('Expected one oversized application batch')
      const key = tail.key
      Object.defineProperty(tail, 'key', { configurable: true, get() {
        diagnosticTailReads++
        return key
      } })
    })
    const registration = runtime.attachStore(stack.store, { id: 'default' })
    stack.store.$hooks.hook('batch', () => {
      observedTailReads = diagnosticTailReads
      batchTruncated = registration.history.page({ limit: 1 }).entries[0]?.truncated ?? false
    })
    const items = Array.from({ length: 1001 }, (_, index) => ({ id: `item-${index}`, title: `Item ${index}` }))
    const results = await Promise.all(items.map(item => createItem({ store: stack.store, collection: stack.collection('todos'), item, optimistic: false, skipCache: true })))
    expect(stack.remote.callCount('batch')).toBe(1)
    expect(results.map(item => item.id)).toEqual(items.map(item => item.id))
    expect(stack.remote.rows('todos').map(item => item.id)).toEqual(items.map(item => item.id))
    expect(observedTailReads, 'diagnostic traversal must not access operation outside bounded prefix').toBe(0)
    expect(batchTruncated).toBe(true)
  })

  it('discovers detached active SSR metadata without exposing it on ordinary producers', async () => {
    const request = { path: '/todos', method: 'GET', startedAt: 100, status: 'active' as const }
    const runtime = createRstoreDevtools({ kind: 'ssr', request })
    const ordinary = createRstoreDevtools({ kind: 'node', request })
    onTestFinished(runtime.dispose)
    onTestFinished(ordinary.dispose)
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    runtime.attachStore(stack.store, { id: 'default' })
    request.path = '/changed-input'
    const session = runtime.read({ method: 'rstore:list-sessions' })[0]!
    expect(session.request).toEqual({ path: '/todos', method: 'GET', startedAt: 100, status: 'active' })
    expect(session.stores[0]!.capabilities.readOnly).toBe(true)
    session.request!.path = '/changed-reply'
    expect(runtime.session.request?.path).toBe('/todos')
    expect(ordinary.session.request).toBeUndefined()
    expect(() => createRstoreDevtools({ kind: 'ssr', request: { ...request, path: '/todos?token=hidden' } })).toThrow('Invalid SSR request metadata')
  })
})
