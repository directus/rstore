/**
 * Wire format shared by the client batch hook and the server `_batch` endpoint.
 *
 * Each entry is one store-level operation. The server dispatches them in
 * parallel and returns one result envelope per op, order-preserving.
 */

export type BatchWireOperation
  = | { type: 'fetchFirst', collection: string, key: string, searchQuery: any }
    | { type: 'create', collection: string, item: Record<string, any> }
    | { type: 'update', collection: string, key: string, item: Record<string, any> }
    | { type: 'delete', collection: string, key: string }

export interface BatchWireRequest {
  operations: BatchWireOperation[]
}

/**
 * Either a success result or a failure. The server always returns one of
 * these per op — a single op throwing never fails the whole batch.
 */
export type BatchWireResult
  = | { ok: true, result: any }
    | BatchWireError

export interface BatchWireError {
  ok: false
  error: string
  /**
   * HTTP status the operation failed with, when the server produced one
   * (`createError` in a hook, a duplicate create, a denied table). Optional so
   * a client and a server that skew across a deploy still agree on the envelope.
   */
  statusCode?: number
  statusMessage?: string
}

export interface BatchWireResponse {
  results: BatchWireResult[]
}

/**
 * Flattens a thrown server error into the failure envelope.
 *
 * `data` is deliberately left out: the whole batch response goes through a
 * single `SuperJSON.stringify`, so one operation's unserializable payload would
 * turn a per-operation failure into a failure of the entire batch.
 *
 * @param error The error thrown while dispatching one operation.
 * @returns The failure envelope for that operation.
 */
export function toBatchWireError(error: any): BatchWireError {
  return {
    ok: false,
    error: error?.message ?? String(error),
    statusCode: typeof error?.statusCode === 'number' ? error.statusCode : undefined,
    statusMessage: typeof error?.statusMessage === 'string' ? error.statusMessage : undefined,
  }
}

/**
 * Rebuilds the client-side error for a failed operation.
 *
 * Individual REST calls reject with an ofetch error carrying `statusCode`, and
 * callers act on it — `@rstore/offline` drops a queued mutation on a permanent
 * `4xx` and retries everything else forever. Batched operations must reject
 * with the same shape, or a replayed duplicate create is retried on every sync
 * instead of being dropped.
 *
 * @param entry The failure envelope received from the server.
 * @returns The error to reject the operation with.
 */
export function fromBatchWireError(entry: BatchWireError): Error {
  const error = new Error(entry.error) as Error & { statusCode?: number, statusMessage?: string }
  if (entry.statusCode != null) {
    error.statusCode = entry.statusCode
    error.statusMessage = entry.statusMessage
  }
  return error
}
