import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany, findFirst, mutate } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'

// Real Core, Vue cache, and instrumentation; shared remote substitutes backend.
// Stable IDs connect starts to completions without retaining unbounded metadata.
describe('operation history correlation', () => {
  it('correlates generated create keys and releases completed pending capacity', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools({ historyLimit: 10 })
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    for (let index = 0; index < 1001; index++) {
      registration.history.clear()
      await createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: `created-${index}` }, skipCache: true })
      const events = registration.history.page().entries.filter(entry => entry.operation === 'create')
      expect(events.map(entry => entry.phase)).toEqual(['start', 'complete'])
      expect(events[0]!.operationId).toBeTypeOf('number')
      expect(events[1]!.operationId).toBe(events[0]!.operationId)
      expect(events[1]!.key).toBe(`created-${index}`)
    }
    expect(stack.remote.rows('todos')).toHaveLength(1001)
    await findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'created-1000', fetchPolicy: 'fetch-only' } })
    const fetch = registration.history.page().entries.filter(entry => entry.operation === 'fetchFirst')
    expect(fetch[0]!.operationId).toBeTypeOf('number')
    expect(fetch[1]!.operationId).toBe(fetch[0]!.operationId)
  })

  it('preserves inferred custom mutation target and correlation on rejection', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const failure = new Error('custom backend refused')
    await expect(mutate(stack.store, { collection: stack.collection('todos'), mutation: 'update', item: { id: 'target' } }, async () => {
      throw failure
    })).rejects.toBe(failure)
    const events = registration.history.page().entries.filter(entry => entry.operation === 'update')
    expect(events.map(entry => entry.phase)).toEqual(['start', 'error'])
    expect(events[0]!.operationId).toBeTypeOf('number')
    expect(events[1]!.operationId).toBe(events[0]!.operationId)
    expect(events[1]!.key).toBe('target')
    expect(stack.store.$mutationHistory).toEqual([])
  })

  it('correlates concurrent invocations sharing metadata and later recovery', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const meta = {}
    const release = stack.remote.holdNext('createItem', { count: 2 })
    const pending = Promise.all(['one', 'two'].map(id => createItem({ store: stack.store, collection: stack.collection('todos'), meta, item: { id }, skipCache: true })))
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(2))
    }
    finally {
      release()
      await pending
    }
    const completed = registration.history.page().entries.filter(entry => entry.operation === 'create' && entry.phase === 'complete')
    const starts = registration.history.page().entries.filter(entry => entry.operation === 'create' && entry.phase === 'start')
    expect(starts.map(entry => entry.operationId)).toEqual([1, 2])
    expect(completed.map(entry => entry.operationId)).toEqual([1, 2])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['one', 'two'])
    registration.history.clear()
    await createItem({ store: stack.store, collection: stack.collection('todos'), meta, item: { id: 'recovered' }, skipCache: true })
    const recovered = registration.history.page().entries.filter(entry => entry.operation === 'create')
    expect(recovered[0]!.operationId).toBeTypeOf('number')
    expect(recovered[1]!.operationId).toBe(recovered[0]!.operationId)
  })

  it('does not misattribute bulk fallback hooks to single create sharing metadata', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], on: { createMany: () => [] } })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const meta = {}
    const release = stack.remote.holdNext('createItem')
    const single = createItem({ store: stack.store, collection: stack.collection('todos'), meta, item: { id: 'single' }, skipCache: true })
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))
      await createMany({ store: stack.store, collection: stack.collection('todos'), meta, items: [{ id: 'bulk-one' }, { id: 'bulk-two' }], skipCache: true })
    }
    finally {
      release()
      await single
    }
    const starts = registration.history.page().entries.filter(entry => entry.operation === 'create' && entry.phase === 'start')
    const completions = registration.history.page().entries.filter(entry => entry.operation === 'create' && entry.phase === 'complete' && entry.operationId !== undefined)
    expect(starts.map(entry => entry.operationId)).toEqual([1, 2])
    expect(completions.map(entry => [entry.key, entry.operationId])).toEqual([[undefined, 2], ['single', 1]])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['bulk-one', 'bulk-two', 'single'])
  })

  it('keeps late relation failure attached to completed parent fetch', async () => {
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos', relations: { children: { many: true, to: { children: { on: { todoId: 'id' } } } } } }, { name: 'children' }],
      data: { todos: [{ id: 'target' }] },
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const failure = new Error('relations refused')
    stack.remote.failNext('fetchRelations', failure)
    await expect(findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'target', include: { children: true } } })).rejects.toBe(failure)
    const events = registration.history.page().entries.filter(entry => entry.operation === 'fetchFirst' && entry.collection === 'todos')
    expect(events.map(entry => entry.phase)).toEqual(['start', 'complete', 'error'])
    expect(events[0]!.operationId).toBeTypeOf('number')
    expect(events.map(entry => entry.operationId)).toEqual([events[0]!.operationId, events[0]!.operationId, events[0]!.operationId])
  })

  it('bounds candidates when caller reuses metadata for many distinct keys', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools({ historyLimit: 10 })
    onTestFinished(runtime.dispose)
    runtime.attachStore(stack.store, { id: 'store' })
    const meta = {}
    // Observe actual Map writes, without replacing any algorithm or workflow.
    // Resource assertion complements public history; stale maps are invisible
    // to consumers until memory/time usage grows beyond bounded diagnostics.
    const writes = vi.spyOn(Map.prototype, 'set')
    onTestFinished(() => writes.mockRestore())
    for (let index = 0; index < 1200; index++)
      await findFirst({ store: stack.store, collection: stack.collection('todos'), meta, findOptions: { key: `missing-${index}`, fetchPolicy: 'fetch-only' } })
    const candidateMaps = writes.mock.calls.flatMap(([, value], index) =>
      value && typeof value === 'object' && 'count' in value && 'expires' in value && 'id' in value
        ? [writes.mock.contexts[index] as Map<unknown, unknown>]
        : [])
    expect(candidateMaps.length).toBeGreaterThan(0)
    expect(Math.max(...candidateMaps.map(map => map.size))).toBeLessThanOrEqual(1000)
  })
})
