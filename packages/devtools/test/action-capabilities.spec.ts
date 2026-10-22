import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createFakeRemote } from '#test-utils/store/fakeRemote'
import { describe, expect, it, onTestFinished } from 'vitest'
import { executeAction } from '../src/actions'
import { createRstoreDevtools } from '../src/runtime'

/** Limit existing simulated backend to hooks a supported connector exposes. */
function backend(hooks: string[], scopeId?: string, ignoreScope = false) {
  const remote = createFakeRemote({ data: { todos: [{ id: 'keep', title: 'Keep' }] }, batch: ['batch', 'batchMutate'] })
  const plugin: Plugin = {
    ...remote.plugin,
    scopeId,
    setup(api) {
      return remote.plugin.setup({
        ...api,
        hook(name, callback) {
          return hooks.includes(name) ? api.hook(name, callback, { ignoreScope }) : () => {}
        },
      })
    },
  }
  return { remote, plugin }
}

describe('connector CRUD capability discovery', () => {
  // Entry: public Devtools reads/actions, actual Core dispatch/scheduler and Vue
  // cache. Only existing external backend fixture is restricted/configured.
  // Scope/batch omissions formerly rejected supported CRUD; exact backend rows
  // prove completed writes hit target while independent record survives.
  it.each([
    { name: 'matching scope', hooks: ['createItem', 'updateItem', 'deleteItem'], scopeId: 'source', collectionScope: 'source' },
    { name: 'unscoped collection', hooks: ['createItem', 'updateItem', 'deleteItem'], scopeId: 'source' },
    { name: 'ignoreScope hook', hooks: ['createItem', 'updateItem', 'deleteItem'], scopeId: 'source', collectionScope: 'other', ignoreScope: true },
    { name: 'batchMutate only', hooks: ['batchMutate'], scopeId: 'source', collectionScope: 'source', batching: true },
    { name: 'batchMutate ignoreScope', hooks: ['batchMutate'], scopeId: 'source', collectionScope: 'other', ignoreScope: true, batching: true },
    // Unified batch payload has no collection: Core does not apply collection
    // scope filtering at that tier, even when its operations carry scopes.
    { name: 'unified batch only', hooks: ['batch'], scopeId: 'source', collectionScope: 'other', batching: true },
  ])('executes supported CRUD with $name', async (scenario) => {
    const { remote, plugin } = backend(scenario.hooks, scenario.scopeId, scenario.ignoreScope)
    const stack = await createCoreStack({
      factory: 'core',
      remote: false,
      plugins: [plugin],
      schema: [{ name: 'todos', scopeId: scenario.collectionScope }],
      batching: scenario.batching ? { mutations: true } : false,
    })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'connector' })
    expect(runtime.read({ method: 'rstore:get-collections', target }).data).toMatchObject([
      { name: 'todos', actions: ['create-item', 'update-item', 'delete-item'] },
    ])
    /** Await command completion before inspecting backend state. */
    async function run(action: string, fields: Record<string, unknown>) {
      const result = await executeAction(runtime, {
        target,
        commandId: crypto.randomUUID(),
        issuedAt: Date.now(),
        collection: 'todos',
        action,
        ...fields,
      })
      expect(result.status).toBe('completed')
    }
    await run('create-item', { item: { id: 'target', title: 'Created' } })
    expect(remote.rows('todos')).toEqual([{ id: 'keep', title: 'Keep' }, { id: 'target', title: 'Created' }])
    await run('update-item', { key: 'target', item: { title: 'Updated' } })
    expect(remote.rows('todos')).toEqual([{ id: 'keep', title: 'Keep' }, { id: 'target', title: 'Updated' }])
    await run('delete-item', { key: 'target' })
    expect(remote.rows('todos')).toEqual([{ id: 'keep', title: 'Keep' }])
    expect(stack.read('todos', 'target')).toBeUndefined()
  })

  // Denial oracle: preserve nonempty backend/cache and reject before hooks.
  it.each([
    { name: 'different scope', hooks: ['createItem', 'updateItem', 'deleteItem'], batching: false },
    { name: 'different batchMutate scope', hooks: ['batchMutate'], batching: true },
    { name: 'disabled mutation batching', hooks: ['batchMutate', 'batch'], batching: false },
  ])('rejects unsupported CRUD with $name', async (scenario) => {
    const { remote, plugin } = backend(scenario.hooks, 'source')
    const stack = await createCoreStack({
      factory: 'core',
      remote: false,
      plugins: [plugin],
      schema: [{ name: 'todos', scopeId: 'other' }],
      batching: { mutations: scenario.batching },
    })
    stack.cache.writeItem({ collection: stack.collection('todos'), key: 'keep', item: { id: 'keep', title: 'Keep' } })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const { target } = runtime.attachStore(stack.store, { id: 'connector' })
    expect(runtime.read({ method: 'rstore:get-collections', target }).data).toMatchObject([{ name: 'todos', actions: [] }])
    for (const fields of [
      { action: 'create-item', item: { id: 'target', title: 'Lost' } },
      { action: 'update-item', key: 'keep', item: { title: 'Lost' } },
      { action: 'delete-item', key: 'keep' },
    ]) {
      await expect(executeAction(runtime, {
        target,
        commandId: crypto.randomUUID(),
        issuedAt: Date.now(),
        collection: 'todos',
        ...fields,
      })).rejects.toMatchObject({ details: { code: 'CAPABILITY_UNAVAILABLE' } })
    }
    expect(remote.calls).toEqual([])
    expect(remote.rows('todos')).toEqual([{ id: 'keep', title: 'Keep' }])
    expect(stack.read('todos', 'keep')).toMatchObject({ id: 'keep', title: 'Keep' })
  })
})
