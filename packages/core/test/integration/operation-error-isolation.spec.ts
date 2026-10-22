import type { CoreStack } from '#test-utils/store/coreStack'
import type { FakeRemoteHook } from '#test-utils/store/fakeRemote'
import type { CollectionDefaults, HookDefinitions, StoreSchema } from '@rstore/shared'
import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { createItem, createMany, deleteItem, deleteMany, findFirst, findMany, mutate, updateItem, updateMany } from '@rstore/core'
import { describe, expect, it, onTestFinished } from 'vitest'

/** Real operation failures observed by diagnostics. */
type OperationError = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['fetchError' | 'mutationError']>[0]

const rows = [{ id: 'target', title: 'Original' }, { id: 'other', title: 'Preserved' }]

// Boundary: real Core public operations, hooks, optimistic rollback, Vue cache;
// existing scripted remote is the external-service boundary. A pending observer
// must not delay original rejection or starve subsequent observers. Held work is
// released in teardown even when the bounded rejection assertion fails.
/** Keep first observer pending and exercise failures in later observers. */
function observeWithPendingDiagnostic(stack: CoreStack, name: 'fetchError' | 'mutationError') {
  const held = createDeferred<void>()
  const errors: OperationError[] = []
  const unhandled = trackUnhandledRejections()
  onTestFinished(() => {
    held.resolve()
    unhandled.stop()
  })
  stack.store.$hooks.hook(name, () => held.promise)
  stack.store.$hooks.hook(name, () => {
    throw new Error('synchronous diagnostic failure')
  })
  stack.store.$hooks.hook(name, async () => {
    throw new Error('asynchronous diagnostic failure')
  })
  stack.store.$hooks.hook(name, (payload: OperationError) => {
    errors.push(payload)
  })
  return { errors, unhandled }
}

/** Ordinary rejection must settle before an event-loop turn, without release. */
async function expectOriginalRejection(pending: Promise<unknown>, failure: Error) {
  const result = await Promise.race([
    pending.then(() => Symbol('unexpected success'), error => error),
    new Promise(resolve => setImmediate(() => resolve(Symbol('diagnostic blocked application')))),
  ])
  expect(result, 'Diagnostic observers must not delay original rejection').toBe(failure)
}

/** One mutation entry and external connector failure, if applicable. */
interface FailureCase {
  /** Public API label. */
  name: string
  /** External hook whose next call fails. */
  connector?: FakeRemoteHook
  /** Public operation under test. */
  run: (stack: CoreStack, failure: Error) => Promise<unknown>
}

const mutations: FailureCase[] = [
  { name: 'createItem', connector: 'createItem', run: stack => createItem({ store: stack.store, collection: stack.collection('todos'), item: { id: 'new', title: 'New' } }) },
  { name: 'createMany', connector: 'createMany', run: stack => createMany({ store: stack.store, collection: stack.collection('todos'), items: [{ id: 'new', title: 'New' }] }) },
  { name: 'updateItem', connector: 'updateItem', run: stack => updateItem({ store: stack.store, collection: stack.collection('todos'), key: 'target', item: { title: 'Changed' } }) },
  { name: 'updateMany', connector: 'updateMany', run: stack => updateMany({ store: stack.store, collection: stack.collection('todos'), items: [{ id: 'target', title: 'Changed' }] }) },
  { name: 'deleteItem', connector: 'deleteItem', run: stack => deleteItem({ store: stack.store, collection: stack.collection('todos'), key: 'target' }) },
  { name: 'deleteMany', connector: 'deleteMany', run: stack => deleteMany({ store: stack.store, collection: stack.collection('todos'), keys: ['target', 'other'] }) },
  ...[false, true].map(many => ({
    name: `custom mutate (many: ${many})`,
    run: (stack: CoreStack, failure: Error) => mutate(stack.store, {
      collection: stack.collection('todos'),
      mutation: 'update',
      ...(many ? { keys: ['target', 'other'] } : { key: 'target', item: { title: 'Changed' } }),
    }, async () => {
      throw failure
    }),
  })),
]

describe('diagnostic observers cannot block application failures', () => {
  it.each(mutations)('$name rejects independently and finishes rollback', async (operation) => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: rows } })
    await findMany({ store: stack.store, collection: stack.collection('todos') })
    const failure = new Error('remote mutation refused')
    const { errors, unhandled } = observeWithPendingDiagnostic(stack, 'mutationError')
    if (operation.connector)
      stack.remote.failNext(operation.connector, failure)

    await expectOriginalRejection(operation.run(stack, failure), failure)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.error).toBe(failure)
    expect(stack.remote.rows('todos')).toEqual(rows)
    expect(stack.read('todos', 'target')).toMatchObject(rows[0]!)
    expect(stack.read('todos', 'other')).toMatchObject(rows[1]!)
    expect(stack.read('todos', 'new')).toBeUndefined()
    expect([...stack.cache.inspect!().layers()]).toEqual([])
    expect(stack.store.$mutationHistory).toEqual([])
    expect(await unhandled.flush()).toEqual([])
  })

  describe.each([false, true])('query failure (many: %s)', (many) => {
    it.each(['fetch-only', 'cache-and-fetch'] as const)('%s rejects independently without cache publication', async (fetchPolicy) => {
      const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: rows } })
      const failure = new Error('remote query refused')
      const { errors, unhandled } = observeWithPendingDiagnostic(stack, 'fetchError')
      const hook = many ? 'fetchMany' : 'fetchFirst'
      stack.remote.failNext(hook, failure)
      const release = stack.remote.holdNext(hook)
      onTestFinished(release)
      const pending = many
        ? findMany({ store: stack.store, collection: stack.collection('todos'), findOptions: { fetchPolicy } })
        : findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'target', fetchPolicy } })
      if (fetchPolicy === 'cache-and-fetch') {
        const initial = await pending
        expect(initial.result).toEqual(many ? [] : null)
        expect(initial.fetchPromise).toBeDefined()
        release()
        await expectOriginalRejection(initial.fetchPromise!, failure)
      }
      else {
        release()
        await expectOriginalRejection(pending, failure)
      }
      expect(errors).toHaveLength(1)
      expect(errors[0]!.error).toBe(failure)
      expect(stack.remote.rows('todos')).toEqual(rows)
      expect(stack.read('todos', 'target')).toBeUndefined()
      expect(stack.read('todos', 'other')).toBeUndefined()
      expect(await unhandled.flush()).toEqual([])
    })
  })
})
