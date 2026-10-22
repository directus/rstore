import type { Target } from '../src/protocol'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { executeAction } from '../src/actions'
import { createRstoreDevtools } from '../src/runtime'

/** Build independent commands against an exact registration. */
function command(target: Target, fields: Record<string, unknown>) {
  return { target, commandId: crypto.randomUUID(), issuedAt: Date.now(), ...fields }
}

describe('authoritative action capabilities and completion', () => {
  // Public execution, actual Core and Vue cache remain real. No remote plugin
  // means no declared backend capability; denied deletion must preserve data.
  it('rejects unsupported collection CRUD while preserving cache operations', async () => {
    const stack = await createCoreStack({ factory: 'core', remote: false, schema: [{ name: 'local' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'local' })
    const { target } = registration
    stack.cache.writeItem({ collection: stack.collection('local'), key: 'keep', item: { id: 'keep', title: 'Original' } })
    expect(runtime.read({ method: 'rstore:get-collections', target }).data).toMatchObject([{ name: 'local', actions: [] }])
    const historySequence = registration.history.page().nextSequence
    for (const fields of [
      { action: 'delete-item', key: 'keep' },
      { action: 'create-item', item: { id: 'new' } },
      { action: 'update-item', key: 'keep', item: { title: 'Lost' } },
    ]) {
      await expect(executeAction(runtime, command(target, { collection: 'local', ...fields })))
        .rejects
        .toMatchObject({ details: { code: 'CAPABILITY_UNAVAILABLE' } })
    }
    expect(stack.read('local', 'keep')).toMatchObject({ id: 'keep', title: 'Original' })
    expect(stack.read('local', 'new')).toBeUndefined()
    expect(registration.history.page().nextSequence).toBe(historySequence)
    const result = await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'local', item: { id: 'new', title: 'Local write' } }))
    expect(result.status).toBe('completed')
    expect(stack.read('local', 'new')).toMatchObject({ title: 'Local write' })
  })

  // A stale partially published batch drains while this distinct command stays
  // pending. Global queue count does not identify completion of this command.
  it('reports accepted until its own staggered write becomes visible', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], cacheStaggering: 1 })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'staggered' })
    let current = true
    stack.cache.writeItems({
      collection: stack.collection('todos'),
      items: [{ key: 'first', value: { id: 'first' } }, { key: 'stale', value: { id: 'stale' } }],
      meta: { $canPublishQuery: () => current },
    })
    current = false
    const result = await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'todos', item: { id: 'command', title: 'Saved' } }))
    expect(stack.read('todos', 'command')).toBeUndefined()
    expect(result).toMatchObject({ status: 'accepted', queued: true })
    await vi.waitFor(() => expect(stack.read('todos', 'command')).toMatchObject({ title: 'Saved' }))
    expect(stack.read('todos', 'first')).toMatchObject({ id: 'first' })
    expect(stack.read('todos', 'stale')).toBeUndefined()
  })

  it('tracks paused commands without optional diagnostic inspection', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    delete stack.cache.inspect
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'uninspected' })
    stack.cache.pause()
    const result = await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'todos', item: { id: 'queued', title: 'Saved' } }))
    expect(result).toMatchObject({ status: 'accepted', queued: true })
    expect(stack.read('todos', 'queued')).toBeUndefined()
    stack.cache.resume()
    expect(stack.read('todos', 'queued')).toMatchObject({ title: 'Saved' })
    const deleted = await executeAction(runtime, command(target, { action: 'delete-cache-item', collection: 'todos', key: 'queued' }))
    expect(deleted.status).toBe('completed')
    expect(stack.read('todos', 'queued')).toBeUndefined()

    stack.cache.writeItem({ collection: stack.collection('todos'), key: 'keep', item: { id: 'keep' } })
    stack.cache.pause()
    const pendingDelete = await executeAction(runtime, command(target, { action: 'delete-cache-item', collection: 'todos', key: 'keep' }))
    expect(pendingDelete).toMatchObject({ status: 'accepted', queued: true })
    expect(stack.read('todos', 'keep')).toMatchObject({ id: 'keep' })
    stack.cache.resume()
    expect(stack.read('todos', 'keep')).toBeUndefined()

    stack.cache.writeItem({ collection: stack.collection('todos'), key: 'clear', item: { id: 'clear' } })
    stack.cache.pause()
    const pendingClear = await executeAction(runtime, command(target, { action: 'clear-cache' }))
    expect(pendingClear).toMatchObject({ status: 'accepted', queued: true })
    expect(stack.read('todos', 'clear')).toMatchObject({ id: 'clear' })
    stack.cache.resume()
    expect(stack.read('todos', 'clear')).toBeUndefined()
  })

  it('ignores incidental legacy return values without explicit receipt capability', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    // A supported cache without this optional capability cannot certify command
    // completion, even when its underlying void callback returns an object.
    delete stack.cache.receipts
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'legacy' })
    const result = await executeAction(runtime, command(target, { action: 'write-cache-item', collection: 'todos', item: { id: 'saved', title: 'Legacy' } }))
    expect(result).toMatchObject({ status: 'accepted', queued: true })
    expect(stack.read('todos', 'saved')).toMatchObject({ title: 'Legacy' })
  })
})
