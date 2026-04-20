import type { CustomHookMeta, GlobalStoreType, StoreCore } from '@rstore/shared'
import type { InternalBatchMutationOperation } from './operations'

/**
 * Flush a set of per-collection/per-type mutation operations.
 *
 * Tries `batchMutate` hook first; plugins resolve the ops they own via
 * `op.setResult` / `op.setError`. Unresolved ops fall back to their
 * individual `createItem` / `updateItem` / `deleteItem` hook.
 */
export async function flushMutationBatch(
  store: StoreCore<any, any>,
  operations: InternalBatchMutationOperation[],
  group: string = 'default',
): Promise<void> {
  if (operations.length === 0) {
    return
  }

  const collection = operations[0]!.collection
  const mutationType = operations[0]!.type
  const meta: CustomHookMeta = {}

  try {
    await store.$hooks.callHook('batchMutate', {
      store: store as unknown as GlobalStoreType,
      meta,
      group,
      collection,
      mutation: mutationType,
      operations,
    })
  }
  catch (error) {
    for (const op of operations) {
      if (!op.resolved) {
        op.setError(error as Error)
      }
    }
    return
  }

  const unresolved = operations.filter(op => !op.resolved)
  if (unresolved.length === 0) {
    return
  }

  await Promise.all(unresolved.map(op => dispatchIndividualMutation(store, op)))
}

/**
 * Dispatch a single unresolved mutation op through its individual hook
 * (`createItem` / `updateItem` / `deleteItem`) and route the result back.
 *
 * Delete resolves with `undefined`; create/update resolve with the raw item
 * returned by the hook. Callers (`createItem` / `updateItem`) own parsing and
 * cache reconciliation, so nothing is transformed here.
 */
async function dispatchIndividualMutation(
  store: StoreCore<any, any>,
  op: InternalBatchMutationOperation,
): Promise<void> {
  try {
    if (op.type === 'delete') {
      const abort = store.$hooks.withAbort()
      await store.$hooks.callHook('deleteItem', {
        store: store as unknown as GlobalStoreType,
        meta: op.meta,
        collection: op.collection,
        key: op.key!,
        abort,
      })
      op.setResult(undefined)
      return
    }

    if (op.type === 'create') {
      let result: any
      const abort = store.$hooks.withAbort()
      await store.$hooks.callHook('createItem', {
        store: store as unknown as GlobalStoreType,
        meta: op.meta,
        collection: op.collection,
        item: op.item as any,
        getResult: () => result,
        setResult: (value, options) => {
          result = value
          if (result && options?.abort !== false) {
            abort()
          }
        },
        abort,
      })
      op.setResult(result)
      return
    }

    // update
    let result: any
    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('updateItem', {
      store: store as unknown as GlobalStoreType,
      meta: op.meta,
      collection: op.collection,
      key: op.key!,
      item: op.item as any,
      getResult: () => result,
      setResult: (value, options) => {
        result = value
        if (result && options?.abort !== false) {
          abort()
        }
      },
      abort,
    })
    op.setResult(result)
  }
  catch (error) {
    op.setError(error as Error)
  }
}
