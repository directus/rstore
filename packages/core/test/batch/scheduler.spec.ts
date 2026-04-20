import type { FindOptions, StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchScheduler, createBatchScheduler } from '../../src/batch/scheduler'

/** Helper: cast bare `{ key }` stub into FindOptions for tests */
function findOpts(key: string | number): FindOptions<any, any, any> {
  return { key } as unknown as FindOptions<any, any, any>
}

/** Helper: read default group entries (undefined-safe) */
function entries(scheduler: BatchScheduler) {
  return scheduler.groups.get('default')?.entries ?? []
}

/** Helper: wait a microtask without tripping queueMicrotask arity checks */
function nextMicrotask(): Promise<void> {
  return new Promise<void>(resolve => queueMicrotask(() => resolve()))
}

describe('batchScheduler', () => {
  let mockStore: StoreCore<any, any>

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
      },
      $processItemParsing: vi.fn(),
    } as any
  })

  describe('createBatchScheduler', () => {
    it('should create a BatchScheduler instance', () => {
      const scheduler = createBatchScheduler(mockStore, {})
      expect(scheduler).toBeInstanceOf(BatchScheduler)
    })

    it('should resolve default options', () => {
      const scheduler = createBatchScheduler(mockStore, {})
      expect(scheduler.options).toEqual({
        fetch: true,
        mutations: true,
        delay: 0,
        maxWait: undefined,
        maxSize: Infinity,
      })
    })

    it('should respect custom options', () => {
      const scheduler = createBatchScheduler(mockStore, {
        fetch: false,
        mutations: true,
        delay: 10,
        maxWait: 100,
        maxSize: 5,
      })
      expect(scheduler.options).toEqual({
        fetch: false,
        mutations: true,
        delay: 10,
        maxWait: 100,
        maxSize: 5,
      })
    })
  })

  describe('enqueue and flush', () => {
    it('should enqueue a fetchFirst entry', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      // Hook that handles batchFetch
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult({ id: '1', name: 'Item 1' })
      })

      const promise = scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      expect(entries(scheduler).length).toBe(1)
      expect(entries(scheduler)[0]!.type).toBe('fetchFirst')

      const result = await promise
      expect(result).toBeDefined()
    })

    it('should enqueue a create entry', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      // Hook that handles batchMutate
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations[0].setResult({ id: '1', name: 'Created Item' })
      })

      const promise = scheduler.enqueueCreate(collection, { name: 'New' }, {})
      expect(entries(scheduler).length).toBe(1)
      expect(entries(scheduler)[0]!.type).toBe('create')

      const result = await promise
      expect(result).toBeDefined()
    })

    it('should enqueue an update entry', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations[0].setResult({ id: '1', name: 'Updated' })
      })

      const promise = scheduler.enqueueUpdate(collection, '1', { name: 'Updated' }, {})
      expect(entries(scheduler).length).toBe(1)
      expect(entries(scheduler)[0]!.type).toBe('update')

      const result = await promise
      expect(result).toBeDefined()
    })

    it('should enqueue a delete entry', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations[0].setResult(undefined)
      })

      const promise = scheduler.enqueueDelete(collection, '1', {})
      expect(entries(scheduler).length).toBe(1)
      expect(entries(scheduler)[0]!.type).toBe('delete')

      await promise
    })

    it('should schedule flush via microtask by default (delay=0)', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult({ id: '1' })
      })

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      expect(scheduler.groups.get('default')?.microtaskScheduled).toBe(true)
      expect(entries(scheduler).length).toBe(1)

      // After microtask, entries should be drained
      await nextMicrotask()
      // Wait for the async flush to complete
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(entries(scheduler).length).toBe(0)
    })

    it('should flush immediately when maxSize is reached', async () => {
      const scheduler = createBatchScheduler(mockStore, { maxSize: 2 })
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })

      // First enqueue - should schedule, not flush yet
      const p1 = scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      expect(entries(scheduler).length).toBe(1)

      // Second enqueue - should trigger immediate flush (maxSize = 2)
      const p2 = scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {})

      // Entries should be drained after immediate flush
      await Promise.all([p1, p2])
      expect(entries(scheduler).length).toBe(0)
    })

    it('should batch multiple operations from the same tick', async () => {
      const scheduler = createBatchScheduler(mockStore, {})
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key, name: `Item ${op.key}` })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      // Enqueue 3 fetches in the same tick
      const p1 = scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      const p2 = scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {})
      const p3 = scheduler.enqueueFetchFirst(collection, '3', findOpts('3'), {})

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])

      // batchFetch should have been called once with all 3 keys
      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].operations.map((op: any) => op.key)).toEqual(['1', '2', '3'])

      expect(r1).toEqual({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(r2).toEqual({ item: { id: '2', name: 'Item 2' }, marker: undefined })
      expect(r3).toEqual({ item: { id: '3', name: 'Item 3' }, marker: undefined })
    })

    it('should use setTimeout when delay > 0', async () => {
      const scheduler = createBatchScheduler(mockStore, { delay: 50 })
      const collection = { name: 'Test', getKey: (item: any) => item.id } as any

      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult({ id: '1' })
      })

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      expect(entries(scheduler).length).toBe(1)

      // After microtask, still not flushed (delay=50ms)
      await nextMicrotask()
      expect(entries(scheduler).length).toBe(1)

      // After delay, should be flushed
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(entries(scheduler).length).toBe(0)
    })
  })
})
