import type { FindOptions, StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatchScheduler } from '../../src/batch/scheduler'

/** Helper: cast bare `{ key }` stub into FindOptions for tests */
function findOpts(key: string | number): FindOptions<any, any, any> {
  return { key } as unknown as FindOptions<any, any, any>
}

/**
 * Tests for the new pacing options on the BatchScheduler:
 * - debounce behaviour when `maxWait` is paired with `delay`
 * - hard-cap `maxWait` flushes under sustained activity
 * - group isolation: separate queues + timers per group name
 */
describe('batchScheduler pacing', () => {
  let mockStore: StoreCore<any, any>
  let collection: any

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
      },
      $processItemParsing: vi.fn(),
    } as any
    collection = { name: 'Test', getKey: (item: any) => item.id }
    vi.useRealTimers()
  })

  describe('debounce (delay + maxWait)', () => {
    it('should reset the flush timer when a new entry is enqueued during the debounce window', async () => {
      vi.useFakeTimers()
      const scheduler = createBatchScheduler(mockStore, { delay: 20, maxWait: 1000 })

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})

      // Advance 15ms — within debounce window, should NOT flush yet
      await vi.advanceTimersByTimeAsync(15)
      expect(batchFetchSpy).not.toHaveBeenCalled()

      // New enqueue resets the timer
      scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {})

      // Advance another 15ms — total 30ms from first enqueue, but only 15ms from last
      await vi.advanceTimersByTimeAsync(15)
      expect(batchFetchSpy).not.toHaveBeenCalled()

      // Advance past the reset debounce
      await vi.advanceTimersByTimeAsync(10)
      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].operations.map((op: any) => op.key)).toEqual(['1', '2'])
    })
  })

  describe('maxWait (hard cap)', () => {
    it('should flush at maxWait from first enqueue even under sustained enqueue activity', async () => {
      vi.useFakeTimers()
      const scheduler = createBatchScheduler(mockStore, { delay: 20, maxWait: 50 })

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})

      // Keep the debounce timer alive by enqueueing every 15ms
      for (let i = 2; i <= 4; i++) {
        await vi.advanceTimersByTimeAsync(15)
        scheduler.enqueueFetchFirst(collection, String(i), findOpts(String(i)), {})
      }

      // Total elapsed: 45ms — debounce would keep resetting, but maxWait=50 fires at 50ms
      await vi.advanceTimersByTimeAsync(10)
      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].operations.map((op: any) => op.key)).toEqual(['1', '2', '3', '4'])
    })

    it('should not re-arm maxWait timer while still in the same flush cycle', async () => {
      vi.useFakeTimers()
      const scheduler = createBatchScheduler(mockStore, { delay: 10, maxWait: 100 })

      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})
      const state = scheduler.groups.get('default')!
      const firstMaxWaitTimer = state.maxWaitTimer

      // Second enqueue within window should NOT reset maxWaitTimer (only debounce timer resets)
      scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {})
      expect(state.maxWaitTimer).toBe(firstMaxWaitTimer)

      // Drain the batch for cleanup
      await vi.advanceTimersByTimeAsync(15)
    })
  })

  describe('group isolation', () => {
    it('should keep entries in different groups in separate queues', () => {
      const scheduler = createBatchScheduler(mockStore, {})

      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })

      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {}, 'tenantA')
      scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {}, 'tenantB')
      scheduler.enqueueFetchFirst(collection, '3', findOpts('3'), {}, 'tenantA')

      expect(scheduler.groups.get('tenantA')?.entries.length).toBe(2)
      expect(scheduler.groups.get('tenantB')?.entries.length).toBe(1)
      expect(scheduler.groups.get('default')).toBeUndefined()
    })

    it('should dispatch separate batch calls per group', async () => {
      const scheduler = createBatchScheduler(mockStore, {})

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key, name: `Item ${op.key}` })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      const pA1 = scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {}, 'A')
      const pB1 = scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {}, 'B')
      const pA2 = scheduler.enqueueFetchFirst(collection, '3', findOpts('3'), {}, 'A')

      await Promise.all([pA1, pA2, pB1])

      // One batchFetch call per group
      expect(batchFetchSpy).toHaveBeenCalledTimes(2)

      // Each call contains only that group's keys
      const keysByCall = batchFetchSpy.mock.calls.map(call => (call[0] as any).operations.map((op: any) => op.key).sort())
      expect(keysByCall).toContainEqual(['1', '3'])
      expect(keysByCall).toContainEqual(['2'])
    })

    it('should apply maxSize independently per group', async () => {
      // delay > 0 so A's queue isn't auto-drained by a microtask flush before we assert
      const scheduler = createBatchScheduler(mockStore, { maxSize: 2, delay: 100 })

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      // Group A: 1 entry (below cap — should wait for setTimeout)
      scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {}, 'A')
      // Group B: 2 entries (hits cap — should flush immediately)
      const pB1 = scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {}, 'B')
      const pB2 = scheduler.enqueueFetchFirst(collection, '3', findOpts('3'), {}, 'B')

      await Promise.all([pB1, pB2])

      // Group B flushed, Group A still queued
      expect(scheduler.groups.get('B')?.entries.length).toBe(0)
      expect(scheduler.groups.get('A')?.entries.length).toBe(1)
    })

    it('should propagate the group name to batch hook payloads', async () => {
      const scheduler = createBatchScheduler(mockStore, {})

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      await scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {}, 'tenantA')

      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].group).toBe('tenantA')
    })

    it('should default to `default` group when enqueued without one', async () => {
      const scheduler = createBatchScheduler(mockStore, {})

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      await scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {})

      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].group).toBe('default')
    })

    it('flush() should drain every group', async () => {
      const scheduler = createBatchScheduler(mockStore, { delay: 50 })

      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) op.setResult({ id: op.key })
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      const pA = scheduler.enqueueFetchFirst(collection, '1', findOpts('1'), {}, 'A')
      const pB = scheduler.enqueueFetchFirst(collection, '2', findOpts('2'), {}, 'B')
      const pC = scheduler.enqueueFetchFirst(collection, '3', findOpts('3'), {}, 'C')

      // Manual flush — drains every group synchronously
      scheduler.flush()

      // Wait for async hook callbacks to complete
      await Promise.all([pA, pB, pC])

      // All groups drained, each got its own batchFetch call
      expect(batchFetchSpy).toHaveBeenCalledTimes(3)
      expect(scheduler.groups.get('A')?.entries.length).toBe(0)
      expect(scheduler.groups.get('B')?.entries.length).toBe(0)
      expect(scheduler.groups.get('C')?.entries.length).toBe(0)
    })
  })
})
