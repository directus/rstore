import type { BatchFetchOperation, BatchMutationOperation } from '@rstore/shared'
import type { BatchEntry } from './scheduler'
import { unwrapItem } from '../item'

/**
 * Internal extension of `BatchFetchOperation` that carries a mutable
 * `resolved` flag the flushers use to route unresolved ops to the next tier.
 */
export interface InternalBatchFetchOperation extends BatchFetchOperation {
  /** Mutable flag — set to `true` when `setResult` / `setError` fires. */
  resolved: boolean
}

/**
 * Internal extension of `BatchMutationOperation` mirroring the fetch variant.
 */
export interface InternalBatchMutationOperation extends BatchMutationOperation {
  /** Mutable flag — set to `true` when `setResult` / `setError` fires. */
  resolved: boolean
}

/**
 * Build a per-operation fetch handle from a queued `BatchEntry`.
 *
 * The returned object exposes the public `BatchFetchOperation` API to plugins
 * while wiring `setResult` / `setError` to the entry's deferred promise
 * callbacks. `resolved` is flipped on the first terminal call so sibling
 * flushers know whether to route this op to the next hook tier.
 *
 * Items passed to `setResult` are unwrapped defensively — plugins may still
 * hand back wrapped items from e.g. a cache layer.
 */
export function createFetchOperation(entry: BatchEntry): InternalBatchFetchOperation {
  const op: InternalBatchFetchOperation = {
    type: 'fetchFirst',
    collection: entry.collection,
    key: entry.key!,
    findOptions: entry.findOptions!,
    meta: entry.meta,
    resolved: false,
    setResult(item, options) {
      if (op.resolved) {
        return
      }
      op.resolved = true
      const unwrapped = item ? unwrapItem(item as any) : undefined
      entry.resolve({ item: unwrapped, marker: options?.marker })
    },
    setError(error) {
      if (op.resolved) {
        return
      }
      op.resolved = true
      entry.reject(error)
    },
  }
  return op
}

/**
 * Build a per-operation mutation handle from a queued `BatchEntry`.
 *
 * Callers (`createItem`/`updateItem`/`deleteItem`) own the parse + cache
 * reconciliation pass, so this helper resolves entries with the raw item
 * returned by the plugin (no unwrap, no parse).
 */
export function createMutationOperation(entry: BatchEntry): InternalBatchMutationOperation {
  const op: InternalBatchMutationOperation = {
    type: entry.type as 'create' | 'update' | 'delete',
    collection: entry.collection,
    key: entry.key,
    item: entry.item,
    meta: entry.meta,
    resolved: false,
    setResult(item) {
      if (op.resolved) {
        return
      }
      op.resolved = true
      entry.resolve(item)
    },
    setError(error) {
      if (op.resolved) {
        return
      }
      op.resolved = true
      entry.reject(error)
    },
  }
  return op
}
