import type { Target } from '../src/protocol'
import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { executeAction } from '../src/actions'
import { createRstoreDevtools } from '../src/runtime'

/** Fresh command preserves exact target and independent effects. */
function command(target: Target, fields: Record<string, unknown>) {
  return { target, commandId: crypto.randomUUID(), issuedAt: Date.now(), ...fields }
}

describe('shared devtools actions', () => {
  // Direct Core/store/cache/runtime stay real; existing remote fixture substitutes external DB.
  // Two stores and keyless patch reject wrong-target and accidental identity merging.
  it('uses public cache and CRUD while preserving exact target and patch identity', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: [{ id: 'other', title: 'Keep' }] } })
    const other = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'chosen' })
    runtime.attachStore(other.store, { id: 'other' })
    const target = registration.target
    await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'todos', item: { id: 0, title: 'Cache only' } }))
    expect(stack.read('todos', 0)).toMatchObject({ title: 'Cache only' })
    expect(other.read('todos', 0)).toBeUndefined()
    expect(stack.remote.rows('todos')).toEqual([{ id: 'other', title: 'Keep' }])
    await executeAction(runtime, command(target, { action: 'delete-cache-item', collection: 'todos', key: 0 }))
    expect(stack.read('todos', 0)).toBeUndefined()
    const created = await executeAction(runtime, command(target, { action: 'create-item', collection: 'todos', item: { id: 'target', title: 'Created' } }))
    expect(created.status).toBe('completed')
    expect(stack.remote.rows('todos')).toEqual([{ id: 'other', title: 'Keep' }, { id: 'target', title: 'Created' }])
    await executeAction(runtime, command(target, { action: 'update-item', collection: 'todos', key: 'target', item: { title: 'Changed' } }))
    expect(stack.remote.lastRequest('updateItem')).toMatchObject({ key: 'target', item: { title: 'Changed' } })
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ title: 'Changed' })
    expect(stack.remote.rows('todos')).toEqual([{ id: 'other', title: 'Keep' }, { id: 'target', title: 'Changed' }])
    expect(registration.history.page().entries.some(entry => entry.operation === 'update')).toBe(true)
    await executeAction(runtime, command(target, { action: 'delete-item', collection: 'todos', key: 'target' }))
    expect(stack.remote.rows('todos')).toEqual([{ id: 'other', title: 'Keep' }])
    expect(other.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', 'target')).toBeUndefined()
    await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'todos', item: { id: '', title: 'Empty key' } }))
    expect(stack.read('todos', '')).toMatchObject({ title: 'Empty key' })
    await executeAction(runtime, command(target, { action: 'clear-cache' }))
    expect(stack.read('todos', '')).toBeUndefined()
    const nextSequence = registration.history.page().nextSequence
    await executeAction(runtime, command(target, { action: 'clear-history' }))
    expect(registration.history.page().entries).toEqual([])
    expect(registration.history.page().nextSequence).toBe(nextSequence)
  })

  it.each(['browser', 'ssr'] as const)('rejects every action for read-only %s before effects', async (kind) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools({ kind })
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'readonly', readOnly: kind !== 'ssr' })
    stack.cache.writeItem({ collection: stack.collection('todos'), key: 'keep', item: { id: 'keep' } })
    const operations = [
      { action: 'clear-history' },
      { action: 'clear-cache' },
      { action: 'write-cache-item', collection: 'todos', item: { id: 'new' } },
      { action: 'delete-cache-item', collection: 'todos', key: 'keep' },
      { action: 'create-item', collection: 'todos', item: { id: 'new' } },
      { action: 'update-item', collection: 'todos', key: 'keep', item: { title: 'Lost' } },
      { action: 'delete-item', collection: 'todos', key: 'keep' },
    ]
    for (const operation of operations)
      await expect(executeAction(runtime, command(registration.target, operation))).rejects.toMatchObject({ details: { code: 'READ_ONLY' } })
    expect(stack.read('todos', 'keep')).toMatchObject({ id: 'keep' })
    expect(stack.remote.calls).toEqual([])
  })

  it('rejects invalid input and stale generations; backend failure leaves cache usable', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    for (const item of [null, [], { kind: 'object', entries: [] }, JSON.parse('{"__proto__":{"polluted":true}}')])
      await expect(executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item }))).rejects.toMatchObject({ details: { code: 'INVALID_ARGUMENTS' } })
    await expect(executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'unknown', item: { id: 'new' } }))).rejects.toMatchObject({ details: { code: 'INVALID_ARGUMENTS' } })
    expect(stack.remote.calls).toEqual([])
    stack.remote.failNext('createItem', new Error('backend refused'))
    await expect(executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item: { id: 'failed' } }))).rejects.toMatchObject({ details: { code: 'BACKEND_FAILURE', message: 'backend refused' } })
    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', 'failed')).toBeUndefined()
    registration.dispose()
    const replacement = runtime.attachStore(stack.store, { id: 'store' })
    await expect(executeAction(runtime, command(registration.target, { action: 'clear-cache' }))).rejects.toMatchObject({ details: { code: 'STALE_TARGET' } })
    expect(replacement.target.generation).toBe(registration.target.generation + 1)
  })

  it('disposal before dispatch cancels connector work', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const pending = executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item: { id: 'cancelled' } }))
    registration.dispose()
    await expect(pending).rejects.toMatchObject({ details: { code: 'TARGET_NOT_FOUND' } })
    expect(stack.remote.calls).toEqual([])
  })

  it('reports paused cache work as accepted and never resumes application cache', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    stack.cache.pause()
    const result = await executeAction(runtime, command(registration.target, { action: 'write-cache-item', collection: 'todos', item: { id: 'queued', title: 'Later' } }))
    expect(result).toMatchObject({ status: 'accepted', queued: true })
    expect(stack.read('todos', 'queued')).toBeUndefined()
    stack.cache.resume()
    expect(stack.read('todos', 'queued')).toMatchObject({ title: 'Later' })
    if (result.result && typeof result.result === 'object' && result.result.kind === 'object')
      result.result.entries.push(['title', 'Tampered'])
    expect(stack.read('todos', 'queued')).toMatchObject({ title: 'Later' })
  })

  it('enforces declared input schema before mutation hooks and preserves valid recovery', async () => {
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos', formSchema: { create: {
        '~standard': { version: 1, vendor: 'test', validate: (value: any) => value.title === 'Allowed' ? { value } : { issues: [{ message: 'Denied title' }] } },
      } } }],
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    await expect(executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item: { id: 'denied', title: 'Denied' } }))).rejects.toMatchObject({ details: { code: 'INVALID_ARGUMENTS' } })
    expect(stack.remote.calls).toEqual([])
    expect(stack.read('todos', 'denied')).toBeUndefined()
    await executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item: { id: 'allowed', title: 'Allowed' } }))
    expect(stack.remote.rows('todos')).toEqual([{ id: 'allowed', title: 'Allowed' }])
  })

  it('rechecks generation after asynchronous schema work before connector dispatch', async () => {
    const gate = createDeferred<void>()
    let validating = false
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos', formSchema: { create: {
        '~standard': { version: 1, vendor: 'test', validate: async (value: unknown) => {
          validating = true
          await gate.promise
          return { value }
        } },
      } } }],
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const pending = executeAction(runtime, command(registration.target, { action: 'create-item', collection: 'todos', item: { id: 'cancelled' } })).catch(error => error)
    try {
      await vi.waitFor(() => expect(validating).toBe(true))
      registration.dispose()
      runtime.attachStore(stack.store, { id: 'store' })
    }
    finally { gate.resolve(undefined) }
    expect(await pending).toMatchObject({ details: { code: 'STALE_TARGET' } })
    expect(stack.remote.calls).toEqual([])
    expect(stack.read('todos', 'cancelled')).toBeUndefined()
  })

  it('owns accepted input so caller edits cannot redirect queued dispatch', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const other = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'chosen' })
    runtime.attachStore(other.store, { id: 'other' })
    const action = { target: { ...registration.target }, commandId: 'owned-input', issuedAt: Date.now(), action: 'create-item', collection: 'todos', item: { id: 'saved', title: 'Original' } }
    const pending = executeAction(runtime, action)
    action.target.storeId = 'other'
    action.item.title = 'Tampered'
    await pending
    expect(stack.remote.rows('todos')).toEqual([{ id: 'saved', title: 'Original' }])
    expect(other.remote.rows('todos')).toEqual([])
  })
})
