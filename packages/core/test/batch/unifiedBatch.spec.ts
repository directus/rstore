import type { StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBatchScheduler } from '../../src/batch/scheduler'

describe('unifiedBatch', () => {
  let mockStore: StoreCore<any, any>
  let collection: any

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
        deleteItem: vi.fn(),
      },
      $processItemParsing: vi.fn(),
    } as any

    collection = {
      name: 'Test',
      getKey: (item: any) => item.id,
    }
  })

  describe('unified batch hook', () => {
    it('resolves fetch + mutation ops via their per-op setResult', async () => {
      const batchSpy = vi.fn((payload: any) => {
        payload.fetches[0].setResult({ id: '1', name: 'Fetched' })
        payload.mutations[0].setResult({ id: '2', name: 'Created' })
      })
      mockStore.$hooks.hook('batch', batchSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const fetchPromise = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const createPromise = scheduler.enqueueCreate(collection, { name: 'New' }, {})

      const [fetchResult, createResult] = await Promise.all([fetchPromise, createPromise])

      expect(batchSpy).toHaveBeenCalledOnce()

      const call = batchSpy.mock.calls[0]![0]
      expect(call.operations).toHaveLength(2)
      expect(call.fetches).toHaveLength(1)
      expect(call.fetches[0].key).toBe('1')
      expect(call.mutations).toHaveLength(1)
      expect(call.mutations[0].type).toBe('create')

      expect(fetchResult).toEqual({ item: { id: '1', name: 'Fetched' }, marker: undefined })
      expect(createResult).toEqual({ id: '2', name: 'Created' })
    })

    it('skips batchFetch/batchMutate when every op is resolved by the batch hook', async () => {
      const batchSpy = vi.fn((payload: any) => {
        payload.fetches[0].setResult({ id: '1', name: 'Fetched' })
        payload.mutations[0].setResult(undefined) // delete result
      })
      const batchFetchSpy = vi.fn()
      const batchMutateSpy = vi.fn()

      mockStore.$hooks.hook('batch', batchSpy)
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const fetchPromise = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const deletePromise = scheduler.enqueueDelete(collection, '1', {})

      await Promise.all([fetchPromise, deletePromise])

      expect(batchSpy).toHaveBeenCalledOnce()
      // Every op handled → downstream tiers never called.
      expect(batchFetchSpy).not.toHaveBeenCalled()
      expect(batchMutateSpy).not.toHaveBeenCalled()
    })

    it('falls through to batchFetch / batchMutate when batch hook is not registered', async () => {
      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key, name: `Item ${op.key}` })
        }
      })
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations[0].setResult({ id: 'gen-1', name: 'Created' })
      })

      mockStore.$hooks.hook('batchFetch', batchFetchSpy)
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const fetchPromise = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const createPromise = scheduler.enqueueCreate(collection, { name: 'New' }, {})

      const [fetchResult, createResult] = await Promise.all([fetchPromise, createPromise])

      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchMutateSpy).toHaveBeenCalledOnce()

      expect(fetchResult).toEqual({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(createResult).toEqual({ id: 'gen-1', name: 'Created' })
    })

    it('selectively unresolved ops fall through to per-collection hooks', async () => {
      // batch hook handles only the fetch; mutation falls through.
      mockStore.$hooks.hook('batch', (payload: any) => {
        payload.fetches[0].setResult({ id: '1', name: 'Unified' })
      })
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations[0].setResult({ id: 'm-1', name: 'PerCollection' })
      })
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const fetchPromise = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const createPromise = scheduler.enqueueCreate(collection, { name: 'New' }, {})

      const [fetchResult, createResult] = await Promise.all([fetchPromise, createPromise])

      expect(batchMutateSpy).toHaveBeenCalledOnce()
      expect(fetchResult).toEqual({ item: { id: '1', name: 'Unified' }, marker: undefined })
      expect(createResult).toEqual({ id: 'm-1', name: 'PerCollection' })
    })

    it('rejects every unresolved op when the batch hook throws', async () => {
      mockStore.$hooks.hook('batch', () => {
        throw new Error('Unified batch failed')
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const fetchPromise = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const createPromise = scheduler.enqueueCreate(collection, { name: 'New' }, {})

      await expect(fetchPromise).rejects.toThrow('Unified batch failed')
      await expect(createPromise).rejects.toThrow('Unified batch failed')
    })

    it('handles mixed operations across multiple collections', async () => {
      const collectionB = { name: 'Other', getKey: (item: any) => item.id }

      const batchSpy = vi.fn((payload: any) => {
        for (const op of payload.fetches) {
          const prefix = op.collection.name === 'Other' ? 'Other Item' : 'Test Item'
          op.setResult({ id: op.key, name: `${prefix} ${op.key}` })
        }
        payload.mutations[0].setResult({ id: '2', name: 'Updated Test' })
      })
      mockStore.$hooks.hook('batch', batchSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const p1 = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const p2 = scheduler.enqueueFetchFirst(collectionB as any, 'A', { key: 'A' } as any, {})
      const p3 = scheduler.enqueueUpdate(collection, '2', { name: 'Updated' }, {})

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])

      expect(batchSpy).toHaveBeenCalledOnce()
      expect(batchSpy.mock.calls[0]![0].fetches).toHaveLength(2)
      expect(batchSpy.mock.calls[0]![0].mutations).toHaveLength(1)

      expect(r1).toEqual({ item: { id: '1', name: 'Test Item 1' }, marker: undefined })
      expect(r2).toEqual({ item: { id: 'A', name: 'Other Item A' }, marker: undefined })
      expect(r3).toEqual({ id: '2', name: 'Updated Test' })
    })
  })
})
