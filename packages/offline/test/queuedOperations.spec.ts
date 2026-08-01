import type { OfflineQueuedOperation } from '../src/plugin/types'
import { deleteItem, updateItem } from '@rstore/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installQueuedOperationSyncHook, shouldDropFailedOperation } from '../src/plugin/queuedOperations'
import { createHookCollector, createRuntime } from './utils/plugin'

// Queued mutations are replayed in order on reconnect. An operation that can
// never succeed — the row is gone, the payload is rejected — would otherwise be
// retried on every reconnect forever, and because replay is sequential it also
// blocks every operation queued behind it.

vi.mock('@rstore/core', () => ({
  createItem: vi.fn(),
  createMany: vi.fn(),
  deleteItem: vi.fn(),
  deleteMany: vi.fn(),
  updateItem: vi.fn(),
  updateMany: vi.fn(),
}))

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

describe('queued operation replay', () => {
  let collector: ReturnType<typeof createHookCollector>
  let runtime: ReturnType<typeof createRuntime>['runtime']
  let db: ReturnType<typeof createRuntime>['db']
  let store: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
    // The sync hook logs every failure; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    collector = createHookCollector()
    const created = createRuntime()
    runtime = created.runtime
    db = created.db
    store = { $collections: [{ name: 'Todos' }] }
    installQueuedOperationSyncHook(runtime, collector.hook)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Seeds one queued operation into the ops store. */
  function queueOperation(op: Partial<OfflineQueuedOperation> = {}) {
    const queued = {
      id: 'op-1',
      type: 'update',
      collectionName: 'Todos',
      key: '1',
      item: { id: '1' },
      time: new Date(0),
      ...op,
    } as OfflineQueuedOperation
    db.stores.set(runtime.opsStoreName, new Map([[queued.id, queued]]))
    return queued
  }

  function queuedIds() {
    return [...(db.stores.get(runtime.opsStoreName)?.keys() ?? [])]
  }

  it('removes an operation once it replays successfully', async () => {
    queueOperation()

    await collector.run('sync', { store })

    expect(updateItem).toHaveBeenCalled()
    expect(queuedIds()).toEqual([])
  })

  it('drops an operation the server will never accept', async () => {
    queueOperation()
    vi.mocked(updateItem).mockRejectedValue({ statusCode: 422 })

    await collector.run('sync', { store })

    expect(queuedIds()).toEqual([])
  })

  it('keeps an operation that failed for a transient reason', async () => {
    queueOperation()
    vi.mocked(updateItem).mockRejectedValue({ statusCode: 503 })

    await collector.run('sync', { store })

    expect(queuedIds()).toEqual(['op-1'])
  })

  it('keeps every operation when the device goes offline mid-sync', async () => {
    queueOperation()
    vi.stubGlobal('navigator', { onLine: false })

    await collector.run('sync', { store })

    expect(updateItem).not.toHaveBeenCalled()
    expect(queuedIds()).toEqual(['op-1'])
  })

  it('drops a delete whose target no longer exists', async () => {
    queueOperation({ type: 'delete', item: undefined })
    vi.mocked(deleteItem).mockRejectedValue({ response: { status: 404 } })

    await collector.run('sync', { store })

    expect(queuedIds()).toEqual([])
  })
})
