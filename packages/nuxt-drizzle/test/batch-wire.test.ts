import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { fromBatchWireError, toBatchWireError } from '../src/runtime/utils/batch'

// `@rstore/offline` decides whether to drop or retry a queued mutation from
// `error.statusCode`. Batched operations resolve through this envelope instead
// of an ofetch error, so the status has to survive the round-trip or a replayed
// duplicate create is retried on every sync forever.
describe('batch wire errors', () => {
  it('round-trips the HTTP status of a server error', () => {
    const entry = toBatchWireError(createError({ statusCode: 409, statusMessage: 'Item already exists in collection todos' }))
    const error = fromBatchWireError(entry) as Error & { statusCode?: number, statusMessage?: string }
    expect(error.statusCode).toBe(409)
    expect(error.statusMessage).toBe('Item already exists in collection todos')
    expect(error.message).toBe('Item already exists in collection todos')
  })

  it('leaves an error without a status retryable', () => {
    const error = fromBatchWireError(toBatchWireError(new Error('boom'))) as Error & { statusCode?: number }
    expect(error.statusCode).toBeUndefined()
    expect(error.message).toBe('boom')
  })
})
