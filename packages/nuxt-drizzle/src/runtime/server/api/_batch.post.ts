import type { BatchWireOperation, BatchWireRequest, BatchWireResponse, BatchWireResult } from '../../utils/batch'
import { defineEventHandler, readRawBody, setResponseHeader } from 'h3'
import SuperJSON from 'superjson'
import { drizzleCreate, drizzleDelete, drizzleFindOne, drizzleUpdate } from '../utils/operations'

/**
 * `POST /_batch` — executes many store ops in a single round-trip.
 *
 * Used by the unified `batch` hook in the client plugin. Each op is
 * dispatched in parallel via the same helpers as the individual REST
 * routes (so pre/after hooks, tenant rules, etc. still fire per-op).
 *
 * Errors on a single op are captured into its result envelope instead of
 * bubbling out — one bad op must never poison the rest of the batch.
 */
export default defineEventHandler(async (event): Promise<string> => {
  const raw = (await readRawBody(event, 'utf-8')) ?? ''
  const { operations } = SuperJSON.parse(raw) as BatchWireRequest

  const results = await Promise.all(operations.map(op => dispatchOne(event, op)))

  // Manually SuperJSON-serialize so Date and other non-JSON types round-trip.
  setResponseHeader(event, 'content-type', 'application/json')
  const response: BatchWireResponse = { results }
  return SuperJSON.stringify(response)
})

/**
 * Dispatch a single wire op and return its success/failure envelope.
 * Does not throw — any dispatch error becomes `{ ok: false, error }`.
 */
async function dispatchOne(event: any, op: BatchWireOperation): Promise<BatchWireResult> {
  try {
    const result = await runOp(event, op)
    return { ok: true, result }
  }
  catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) }
  }
}

/** Route a wire op to the matching drizzle helper. */
function runOp(event: any, op: BatchWireOperation) {
  switch (op.type) {
    case 'fetchFirst':
      return drizzleFindOne({
        event,
        collection: op.collection,
        key: op.key,
        params: { collection: op.collection, key: op.key },
        query: {},
        searchQuery: op.searchQuery ?? {},
      })
    case 'create':
      return drizzleCreate({
        event,
        collection: op.collection,
        params: { collection: op.collection },
        query: {},
        body: op.item,
      })
    case 'update':
      return drizzleUpdate({
        event,
        collection: op.collection,
        key: op.key,
        params: { collection: op.collection, key: op.key },
        query: {},
        body: op.item,
      })
    case 'delete':
      return drizzleDelete({
        event,
        collection: op.collection,
        key: op.key,
        params: { collection: op.collection, key: op.key },
        query: {},
      })
  }
}
