import type { CoreStack } from '#test-utils/store/coreStack'
import type { FakeRemoteHook } from '#test-utils/store/fakeRemote'
import type { CollectionDefaults, CustomHookMeta, HookDefinitions, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany, deleteItem, deleteMany, findFirst, findMany, mutate, updateItem, updateMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// Boundary: real Core public operations, hooks, and cache; scripted remote is
// external-service boundary. Missing error dispatch or observer fault must fail
// exact error/meta assertions. Real cache/backend/history protect rollback.
/** Actual shared payload emitted by a failed Core operation. */
type OperationError = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['fetchError' | 'mutationError']>[0]

const initialRows = [{ id: 'target', title: 'Original' }, { id: 'other', title: 'Preserved' }]

/** Public mutation entry and corresponding connector dispatch. */
interface MutationCase {
  /** Operation label. */
  name: string
  /** Connector hook to fail. */
  connector: FakeRemoteHook
  /** Many-operation flag expected in observation. */
  many: boolean
  /** Mutation type expected in observation. */
  mutation: 'create' | 'update' | 'delete'
  /** Invoke actual exported mutation. */
  run: (stack: CoreStack, meta?: CustomHookMeta) => Promise<unknown>
}

const mutations: MutationCase[] = [
  { name: 'createItem', connector: 'createItem', many: false, mutation: 'create', run: (stack, meta) => createItem({ store: stack.store, meta, collection: stack.collection('todos'), item: { id: 'new', title: 'New' } }) },
  { name: 'createMany', connector: 'createMany', many: true, mutation: 'create', run: (stack, meta) => createMany({ store: stack.store, meta, collection: stack.collection('todos'), items: [{ id: 'new', title: 'New' }, { id: 'new2', title: 'New 2' }] }) },
  { name: 'updateItem', connector: 'updateItem', many: false, mutation: 'update', run: (stack, meta) => updateItem({ store: stack.store, meta, collection: stack.collection('todos'), key: 'target', item: { title: 'Changed' } }) },
  { name: 'updateMany', connector: 'updateMany', many: true, mutation: 'update', run: (stack, meta) => updateMany({ store: stack.store, meta, collection: stack.collection('todos'), items: [{ id: 'target', title: 'Changed' }, { id: 'other', title: 'Changed 2' }] }) },
  { name: 'deleteItem', connector: 'deleteItem', many: false, mutation: 'delete', run: (stack, meta) => deleteItem({ store: stack.store, meta, collection: stack.collection('todos'), key: 'target' }) },
  { name: 'deleteMany', connector: 'deleteMany', many: true, mutation: 'delete', run: (stack, meta) => deleteMany({ store: stack.store, meta, collection: stack.collection('todos'), keys: ['target', 'other'] }) },
]

describe('operation error observation', () => {
  it.each([false, true])('reports one fetch failure with original metadata (many: %s)', async (many) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
    const failure = new Error('fetch refused')
    const before: unknown[] = []
    const errors: OperationError[] = []
    const completed: unknown[] = []
    stack.store.$hooks.hook('beforeFetch', (payload) => {
      before.push(payload.meta)
    })
    stack.store.$hooks.hook('fetchError', () => {
      throw new Error('observer failed')
    })
    stack.store.$hooks.hook('fetchError', (payload) => {
      errors.push(payload)
    })
    stack.store.$hooks.hook('afterFetch', (payload) => {
      completed.push(payload.meta)
    })
    stack.remote.failNext(many ? 'fetchMany' : 'fetchFirst', failure)
    const run = () => many
      ? findMany({ store: stack.store, collection: stack.collection('todos'), findOptions: { fetchPolicy: 'fetch-only' } })
      : findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'target', fetchPolicy: 'fetch-only' } })

    await expect(run()).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ error: failure, many, collection: { name: 'todos' } })
    expect(errors[0]!.meta).toBe(before[0])
    if (!many)
      expect(errors[0]!.key).toBe('target')
    expect(completed).toEqual([])
    expect(stack.read('todos', 'target')).toBeUndefined()
    const retry = await run()
    expect(retry.result).toEqual(many ? initialRows : initialRows[0])
    expect(completed).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('reports rejected beforeFetch hook without connector or completion', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
    const failure = new Error('fetch precondition refused')
    let meta: unknown
    const errors: OperationError[] = []
    stack.store.$hooks.hook('beforeFetch', (payload) => {
      meta = payload.meta
      throw failure
    })
    stack.store.$hooks.hook('fetchError', (payload) => {
      errors.push(payload)
    })
    await expect(findMany({ store: stack.store, collection: stack.collection('todos') })).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.error).toBe(failure)
    expect(errors[0]!.meta).toBe(meta)
    expect(stack.remote.callCount('fetchMany')).toBe(0)
  })

  it.each([false, true])('reports relation fetch failure after parent fetch (many: %s)', async (many) => {
    const stack = await createCoreStack({
      factory: 'core',
      schema: [{ name: 'todos', relations: { children: { many: true, to: { children: { on: { todoId: 'id' } } } } } }, { name: 'children' }],
      data: { todos: initialRows, children: [{ id: 'child', todoId: 'target' }] },
    })
    const failure = new Error('relation fetch refused')
    const errors: OperationError[] = []
    stack.store.$hooks.hook('fetchError', (payload) => {
      errors.push(payload)
    })
    stack.remote.failNext('fetchRelations', failure)
    const collection = stack.collection('todos')
    await expect(many
      ? findMany({ store: stack.store, collection, findOptions: { include: { children: true } } })
      : findFirst({ store: stack.store, collection, findOptions: { key: 'target', include: { children: true } } })).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ error: failure, many, collection: { name: 'todos' } })
    // Preserve existing publication order: parent data caches before relations.
    expect(stack.read('todos', 'target')).toMatchObject(initialRows[0]!)
  })

  describe.each(['before', 'connector'] as const)('%s mutation failure', (stage) => {
    it.each(mutations)('reports $name without changing rollback or rejection', async (operation) => {
      const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
      await findMany({ store: stack.store, collection: stack.collection('todos') })
      const failure = new Error('mutation refused')
      const errors: OperationError[] = []
      let meta: unknown
      let completions = 0
      stack.store.$hooks.hook(operation.many ? 'beforeManyMutation' : 'beforeMutation', (payload: { meta: unknown }) => {
        meta = payload.meta
        if (stage === 'before')
          throw failure
      })
      stack.store.$hooks.hook('mutationError', async () => {
        throw new Error('observer failed')
      })
      stack.store.$hooks.hook('mutationError', (payload) => {
        errors.push(payload)
      })
      stack.store.$hooks.hook('afterMutation', () => {
        completions++
      })
      stack.store.$hooks.hook('afterManyMutation', () => {
        completions++
      })
      if (stage === 'connector')
        stack.remote.failNext(operation.connector, failure)

      const operationMeta: CustomHookMeta = {}
      await expect(operation.run(stack, operationMeta)).rejects.toBe(failure)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({ error: failure, many: operation.many, mutation: operation.mutation, collection: { name: 'todos' } })
      expect(errors[0]!.meta).toBe(meta)
      expect(meta).toBe(operationMeta)
      expect(completions).toBe(0)
      expect(stack.remote.rows('todos')).toEqual(initialRows)
      expect(stack.read('todos', 'target')).toMatchObject(initialRows[0]!)
      expect(stack.read('todos', 'other')).toMatchObject(initialRows[1]!)
      expect(stack.read('todos', 'new')).toBeUndefined()
      expect(stack.store.$mutationHistory).toEqual([])
      expect([...stack.cache.inspect!().layers()]).toEqual([])
      if (stage === 'before')
        expect(stack.remote.callCount(operation.connector)).toBe(0)
    })
  })

  it.each(mutations)('preserves supplied metadata through successful $name', async (operation) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
    const meta: CustomHookMeta = {}
    const completed: unknown[] = []
    stack.store.$hooks.hook(operation.many ? 'afterManyMutation' : 'afterMutation', (payload: { meta: unknown }) => {
      completed.push(payload.meta)
    })
    await operation.run(stack, meta)
    expect(completed).toEqual([meta])
    expect(completed[0]).toBe(meta)
    const expectedRows = operation.mutation === 'create'
      ? [...initialRows, { id: 'new', title: 'New' }, ...(operation.many ? [{ id: 'new2', title: 'New 2' }] : [])]
      : operation.mutation === 'update'
        ? [{ id: 'target', title: 'Changed' }, { id: 'other', title: operation.many ? 'Changed 2' : 'Preserved' }]
        : operation.many ? [] : [initialRows[1]]
    expect(stack.remote.rows('todos')).toEqual(expectedRows)
  })

  it('reports background fetch rejection without rejecting initial cache result', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
    const failure = new Error('background fetch refused')
    const errors: OperationError[] = []
    stack.store.$hooks.hook('fetchError', (payload) => {
      errors.push(payload)
    })
    stack.remote.failNext('fetchFirst', failure)
    const release = stack.remote.holdNext('fetchFirst')
    try {
      const result = await findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'target', fetchPolicy: 'cache-and-fetch' } })
      expect(result.result).toBeNull()
      expect(result.fetchPromise).toBeDefined()
      release()
      await expect(result.fetchPromise).rejects.toBe(failure)
      expect(errors).toHaveLength(1)
      expect(errors[0]!.error).toBe(failure)
      expect(stack.read('todos', 'target')).toBeUndefined()
    }
    finally {
      release()
    }
  })

  it('reports one bulk failure when fallback single connector fails', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows }, on: { createMany: () => [] } })
    const failure = new Error('fallback create refused')
    const errors: OperationError[] = []
    stack.store.$hooks.hook('mutationError', (payload) => {
      errors.push(payload)
    })
    stack.remote.failNext('createItem', failure)
    await expect(createMany({ store: stack.store, collection: stack.collection('todos'), items: [{ id: 'new', title: 'New' }, { id: 'new2', title: 'New 2' }] })).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ error: failure, mutation: 'create', many: true })
    expect(stack.remote.callCount('createItem')).toBe(2)
    expect(stack.read('todos', 'new')).toBeUndefined()
    expect(stack.read('todos', 'new2')).toBeUndefined()
    expect(stack.store.$mutationHistory).toEqual([])
    // Independent connector calls retain existing partial backend semantics.
    expect(stack.remote.rows('todos')).toEqual([...initialRows, { id: 'new2', title: 'New 2' }])
  })

  it.each([false, true])('reports custom mutate rejection once (many: %s)', async (many) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: initialRows } })
    const failure = new Error('custom remote refused')
    const errors: OperationError[] = []
    let meta: unknown
    stack.store.$hooks.hook(many ? 'beforeManyMutation' : 'beforeMutation', (payload: { meta: unknown }) => {
      meta = payload.meta
    })
    stack.store.$hooks.hook('mutationError', (payload) => {
      errors.push(payload)
    })
    await expect(mutate(stack.store, {
      collection: stack.collection('todos'),
      mutation: 'update',
      ...(many ? { keys: ['target', 'other'] } : { key: 'target', item: { title: 'Changed' } }),
    }, async () => {
      throw failure
    })).rejects.toBe(failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ error: failure, many, mutation: 'update' })
    expect(errors[0]!.meta).toBe(meta)
    expect(stack.store.$mutationHistory).toEqual([])
    expect(stack.remote.rows('todos')).toEqual(initialRows)
  })
})
