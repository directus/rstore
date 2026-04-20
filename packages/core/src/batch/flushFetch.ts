import type { CustomHookMeta, GlobalStoreType, StoreCore } from '@rstore/shared'
import type { InternalBatchFetchOperation } from './operations'

/**
 * Flush a set of per-collection fetch operations.
 *
 * Tries `batchFetch` hook first; plugins resolve the specific ops they own via
 * `op.setResult` / `op.setError`. Any op still unresolved falls through to its
 * own individual `fetchFirst` hook call.
 *
 * Parsing and cache writes are intentionally deferred to the caller (`_findFirst`)
 * so they respect per-entry `fetchPolicy` (e.g. `no-cache`) and avoid
 * double-parsing.
 */
export async function flushFetchBatch(
  store: StoreCore<any, any>,
  operations: InternalBatchFetchOperation[],
  group: string = 'default',
): Promise<void> {
  if (operations.length === 0) {
    return
  }

  const collection = operations[0]!.collection
  const meta: CustomHookMeta = {}

  try {
    await store.$hooks.callHook('batchFetch', {
      store: store as unknown as GlobalStoreType,
      meta,
      group,
      collection,
      operations,
    })
  }
  catch (error) {
    // Unhandled error in a batchFetch plugin fails every op it could touch.
    for (const op of operations) {
      if (!op.resolved) {
        op.setError(error as Error)
      }
    }
    return
  }

  // Fall through unresolved ops to the individual `fetchFirst` hook.
  const unresolved = operations.filter(op => !op.resolved)
  if (unresolved.length === 0) {
    return
  }

  await Promise.all(unresolved.map(op => dispatchIndividualFetch(store, op)))
}

/**
 * Dispatch a single unresolved fetch op through the individual `fetchFirst`
 * hook, then route its result (or error) back to the op.
 *
 * The op's `setResult` handles defensive unwrap; parsing is still the
 * caller's responsibility (inside `_findFirst`).
 */
async function dispatchIndividualFetch(
  store: StoreCore<any, any>,
  op: InternalBatchFetchOperation,
): Promise<void> {
  try {
    let result: any
    let marker: string | undefined

    const abort = store.$hooks.withAbort()
    await store.$hooks.callHook('fetchFirst', {
      store: store as unknown as GlobalStoreType,
      meta: op.meta,
      collection: op.collection,
      key: op.key,
      findOptions: op.findOptions,
      getResult: () => result,
      setResult: (value, options) => {
        result = value
        if (result && options?.abort !== false) {
          abort()
        }
      },
      setMarker: (value) => {
        marker = value
      },
      abort,
    })

    op.setResult(result, { marker })
  }
  catch (error) {
    op.setError(error as Error)
  }
}
