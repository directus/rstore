import type { FakeRemoteBackend } from './fakeRemoteBackend'
import type { FakeRemoteHookSpec } from './fakeRemoteHandlers'
import type { FakeRemoteBatchHook } from './fakeRemoteScript'

/**
 * Batch hooks of {@link import('./fakeRemote').createFakeRemote}.
 *
 * `packages/core/src/batch/flushAll.ts` offers three tiers: the unified
 * `batch` hook, then per-collection `batchFetch` / `batchMutate`, then the
 * individual hooks. The fake answers whichever tier a stack asks for, from the
 * same rows and through the same {@link import('./fakeRemoteScript').CallScript},
 * so `callCount('batchMutate')`, `failNext('batchMutate')`, `holdNext` and
 * `latency` work on batches exactly as they do on single calls.
 */

/** One operation of a batch, as `flushAll` hands it to a plugin. */
interface BatchOperation {
  type: 'fetchFirst' | 'create' | 'update' | 'delete'
  collection: { name: string }
  key?: string | number
  item?: Record<string, any>
  setResult: (item: Record<string, any> | undefined) => void
  setError: (error: Error) => void
}

/**
 * Normalizes the `batch` option into the hooks to register.
 *
 * @param batch `true` means the two per-collection hooks; `false` (the
 * default) means none, so the per-item hooks keep answering.
 */
export function resolveBatchHooks(batch?: boolean | FakeRemoteBatchHook[]): FakeRemoteBatchHook[] {
  if (!batch) {
    return []
  }
  return batch === true ? ['batchFetch', 'batchMutate'] : batch
}

/**
 * Applies one batched operation to the backend rows and resolves it.
 *
 * @param backend The rows shared with the per-item hooks.
 * @param operation The operation to resolve.
 * @returns What the operation was resolved with.
 */
function applyOperation(backend: FakeRemoteBackend, operation: BatchOperation) {
  const name = operation.collection.name
  switch (operation.type) {
    case 'fetchFirst': {
      const result = backend.rows(name).find(item => backend.getKey(name, item) === operation.key)
      operation.setResult(result)
      return result
    }
    case 'create': {
      const result = backend.upsert(name, operation.item ?? {})
      operation.setResult(result)
      return result
    }
    case 'update': {
      const result = backend.upsert(name, backend.withKey(name, operation.item ?? {}, operation.key!))
      operation.setResult(result)
      return result
    }
    case 'delete': {
      backend.remove(name, operation.key!)
      operation.setResult(undefined)
      return undefined
    }
  }
}

/**
 * Builds the specs of the three batch hooks over one backend.
 *
 * None of them declares a `commit`: a batch answers through the `setResult` of
 * each operation, so `ctx.next()` returns the list of resolved values and a
 * handler that wants to deviate resolves the operations itself.
 *
 * @param backend The rows the batches read and write.
 */
export function createBatchHookSpecs(backend: FakeRemoteBackend): Record<FakeRemoteBatchHook, FakeRemoteHookSpec> {
  /** Resolves every operation of a batch, in the order it was scheduled. */
  const runAll = (operations: BatchOperation[]) => operations.map(operation => applyOperation(backend, operation))

  return {
    batch: {
      // A unified batch spans collections, so the call is recorded under the
      // collection of its first operation.
      call: payload => ({
        collection: payload.operations[0]?.collection.name ?? '',
        group: payload.group,
        keys: payload.operations.map((operation: BatchOperation) => operation.key),
      }),
      run: ctx => runAll(ctx.payload.operations),
    },

    batchFetch: {
      call: payload => ({
        collection: payload.collection.name,
        group: payload.group,
        keys: payload.operations.map((operation: BatchOperation) => operation.key),
      }),
      run: ctx => runAll(ctx.payload.operations),
    },

    batchMutate: {
      call: payload => ({
        collection: payload.collection.name,
        group: payload.group,
        mutation: payload.mutation,
        keys: payload.operations.map((operation: BatchOperation) => operation.key),
        items: payload.operations.map((operation: BatchOperation) => operation.item),
      }),
      run: ctx => runAll(ctx.payload.operations),
    },
  }
}
