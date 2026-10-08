import { describe, expect, it } from 'vitest'
import { shouldDropFailedOperation } from '../src/plugin/queuedOperations'

// Browser queue/replay workflows live in test/browser/offlineQueue.spec.ts.
describe('shouldDropFailedOperation', () => {
  it('drops permanent client errors', () => {
    // 409 is load-bearing: a backend answers a replayed create whose first
    // attempt already committed with a conflict, and the replay converges only
    // if that drops the operation.
    for (const status of [400, 403, 404, 409, 410, 422]) {
      expect(shouldDropFailedOperation({ statusCode: status })).toBe(true)
    }
  })

  it('keeps errors that a later retry could resolve', () => {
    // 401 may be fixed by a token refresh, 408/429 are explicit retry signals,
    // and 5xx is the server's problem, not the payload's.
    for (const status of [401, 408, 429, 500, 502, 503]) {
      expect(shouldDropFailedOperation({ statusCode: status })).toBe(false)
    }
  })

  it('reads the status from any of the shapes http clients use', () => {
    expect(shouldDropFailedOperation({ status: 404 })).toBe(true)
    expect(shouldDropFailedOperation({ response: { status: 404 } })).toBe(true)
  })

  it('keeps errors with no usable status', () => {
    // Network failures and the "went offline mid-sync" abort land here.
    expect(shouldDropFailedOperation(new Error('Failed to fetch'))).toBe(false)
    expect(shouldDropFailedOperation({ statusCode: '404' })).toBe(false)
    expect(shouldDropFailedOperation(undefined)).toBe(false)
  })
})
