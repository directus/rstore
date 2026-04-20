import type { CustomHookMeta, GlobalStoreType, StoreCore } from '@rstore/shared'
import type { InternalBatchFetchOperation, InternalBatchMutationOperation } from './operations'
import type { BatchEntry } from './scheduler'
import { flushFetchBatch } from './flushFetch'
import { flushMutationBatch } from './flushMutation'
import { createFetchOperation, createMutationOperation } from './operations'

/**
 * Top-level flush entry point for a single batch group.
 *
 * Pipeline:
 *   1. Wrap every entry in a `BatchFetchOperation` / `BatchMutationOperation`
 *      whose `setResult` / `setError` is bound to the entry's deferred promise.
 *   2. Call the unified `batch` hook once with **all** operations. Plugins
 *      resolve the ops they own; unresolved ops fall through.
 *   3. Route unresolved fetch / mutation operations to the per-collection
 *      `batchFetch` / `batchMutate` hooks, then to the individual hooks.
 *   4. Any op still unresolved after every tier is rejected with an explanatory
 *      error so callers don't hang.
 */
export async function flushAll(
  store: StoreCore<any, any>,
  allEntries: BatchEntry[],
  group: string = 'default',
): Promise<void> {
  if (allEntries.length === 0) {
    return
  }

  // Build per-op handles once so every hook tier shares the same `resolved`
  // flags and `setResult`/`setError` bindings.
  const fetchOps: InternalBatchFetchOperation[] = []
  const mutationOps: InternalBatchMutationOperation[] = []
  for (const entry of allEntries) {
    if (entry.type === 'fetchFirst') {
      fetchOps.push(createFetchOperation(entry))
    }
    else {
      mutationOps.push(createMutationOperation(entry))
    }
  }

  await callUnifiedBatch(store, group, fetchOps, mutationOps)

  // Route any op the unified hook didn't resolve to per-collection flushers.
  const pendingFetches = fetchOps.filter(op => !op.resolved)
  const pendingMutations = mutationOps.filter(op => !op.resolved)

  const promises: Promise<void>[] = []
  for (const [, ops] of groupFetchesByCollection(pendingFetches)) {
    promises.push(flushFetchBatch(store, ops, group))
  }
  for (const [, ops] of groupMutationsByCollectionAndType(pendingMutations)) {
    promises.push(flushMutationBatch(store, ops, group))
  }
  await Promise.all(promises)

  // Any op still unresolved at this point → reject so callers unblock.
  rejectStragglers([...fetchOps, ...mutationOps])
}

/**
 * Call the unified `batch` hook once. Catches thrown errors and routes them
 * to every unresolved op so a broken plugin never hangs the batch.
 */
async function callUnifiedBatch(
  store: StoreCore<any, any>,
  group: string,
  fetchOps: InternalBatchFetchOperation[],
  mutationOps: InternalBatchMutationOperation[],
): Promise<void> {
  const meta: CustomHookMeta = {}
  try {
    await store.$hooks.callHook('batch', {
      store: store as unknown as GlobalStoreType,
      meta,
      group,
      operations: [...fetchOps, ...mutationOps],
      fetches: fetchOps,
      mutations: mutationOps,
    })
  }
  catch (error) {
    for (const op of fetchOps) {
      if (!op.resolved) {
        op.setError(error as Error)
      }
    }
    for (const op of mutationOps) {
      if (!op.resolved) {
        op.setError(error as Error)
      }
    }
  }
}

/**
 * Reject any op that survived every hook tier unresolved. Indicates a plugin
 * misconfiguration — log-worthy but non-fatal for the rest of the batch.
 */
function rejectStragglers(ops: Array<InternalBatchFetchOperation | InternalBatchMutationOperation>): void {
  for (const op of ops) {
    if (!op.resolved) {
      op.setError(new Error(
        `[rstore] No plugin handled the batched ${op.type} on collection "${op.collection.name}". `
        + `Either register a batch hook for this op or set \`batch: false\` on the call.`,
      ))
    }
  }
}

/**
 * Bucket fetch operations by collection name for per-collection dispatch.
 */
function groupFetchesByCollection(
  ops: InternalBatchFetchOperation[],
): Map<string, InternalBatchFetchOperation[]> {
  const groups = new Map<string, InternalBatchFetchOperation[]>()
  for (const op of ops) {
    const key = op.collection.name
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(op)
  }
  return groups
}

/**
 * Bucket mutation operations by `(collection name, mutation type)` — these
 * are the dispatch keys `batchMutate` expects.
 */
function groupMutationsByCollectionAndType(
  ops: InternalBatchMutationOperation[],
): Map<string, InternalBatchMutationOperation[]> {
  const groups = new Map<string, InternalBatchMutationOperation[]>()
  for (const op of ops) {
    const key = `${op.collection.name}:${op.type}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(op)
  }
  return groups
}
