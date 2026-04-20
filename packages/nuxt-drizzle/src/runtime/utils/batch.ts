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
    | { ok: false, error: string }

export interface BatchWireResponse {
  results: BatchWireResult[]
}
