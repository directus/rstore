import type { StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushFetchBatch } from '../../src/batch/flushFetch'
import { createFetchOperation } from '../../src/batch/operations'
import { createBatchScheduler } from '../../src/batch/scheduler'

/**
 * Build an array of fetch operations from raw entry data.
 * Keeps tests terse while exercising the public operation helper.
 */
function fetchOps(entries: Array<{ collection: any, key: string | number, findOptions?: any, resolve: any, reject: any }>) {
  return entries.map(e => createFetchOperation({
    type: 'fetchFirst',
    collection: e.collection,
    key: e.key,
    findOptions: e.findOptions ?? { key: e.key },
    meta: {},
    resolve: e.resolve,
    reject: e.reject,
  }))
}

describe('fetchBatch', () => {
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

    collection = {
      name: 'Test',
      getKey: (item: any) => item.id,
    }
  })

  describe('batchFetch hook', () => {
    it('resolves each op with setResult on the per-op handle', async () => {
      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key, name: `Item ${op.key}` })
        }
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      const resolves = [vi.fn(), vi.fn()]
      const rejects = [vi.fn(), vi.fn()]
      const ops = fetchOps([
        { collection, key: '1', resolve: resolves[0], reject: rejects[0] },
        { collection, key: '2', resolve: resolves[1], reject: rejects[1] },
      ])

      await flushFetchBatch(mockStore, ops)

      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(batchFetchSpy.mock.calls[0]![0].operations).toHaveLength(2)

      expect(resolves[0]).toHaveBeenCalledWith({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(resolves[1]).toHaveBeenCalledWith({ item: { id: '2', name: 'Item 2' }, marker: undefined })
    })

    it('plugin can resolve a subset — unresolved ops fall back to individual fetchFirst', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        // Only resolve key '1'
        const op1 = payload.operations.find((o: any) => o.key === '1')
        op1.setResult({ id: '1', name: 'Item 1' })
      })
      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        payload.setResult({ id: payload.key, name: `Fallback ${payload.key}` })
      })

      const resolves = [vi.fn(), vi.fn()]
      const ops = fetchOps([
        { collection, key: '1', resolve: resolves[0], reject: vi.fn() },
        { collection, key: '2', resolve: resolves[1], reject: vi.fn() },
      ])

      await flushFetchBatch(mockStore, ops)

      expect(resolves[0]).toHaveBeenCalledWith({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(resolves[1]).toHaveBeenCalledWith({ item: { id: '2', name: 'Fallback 2' }, marker: undefined })
    })

    it('op.setResult(undefined) marks the op resolved with no item', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult(undefined)
      })

      const resolve = vi.fn()
      const ops = fetchOps([{ collection, key: '1', resolve, reject: vi.fn() }])

      await flushFetchBatch(mockStore, ops)

      expect(resolve).toHaveBeenCalledWith({ item: undefined, marker: undefined })
    })

    it('op.setResult accepts a marker option', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult({ id: '1' }, { marker: 'etag-abc' })
      })

      const resolve = vi.fn()
      const ops = fetchOps([{ collection, key: '1', resolve, reject: vi.fn() }])

      await flushFetchBatch(mockStore, ops)

      expect(resolve).toHaveBeenCalledWith({ item: { id: '1' }, marker: 'etag-abc' })
    })

    it('does not write to cache — caller owns cache writes', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        payload.operations[0].setResult({ id: '1' })
      })

      await flushFetchBatch(mockStore, fetchOps([
        { collection, key: '1', resolve: vi.fn(), reject: vi.fn() },
      ]))

      expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    })
  })

  describe('fallback to individual fetchFirst', () => {
    it('falls back per-op when no batchFetch hook is registered', async () => {
      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        payload.setResult({ id: payload.key, name: `Individual ${payload.key}` })
      })

      const resolves = [vi.fn(), vi.fn()]
      await flushFetchBatch(mockStore, fetchOps([
        { collection, key: '1', resolve: resolves[0], reject: vi.fn() },
        { collection, key: '2', resolve: resolves[1], reject: vi.fn() },
      ]))

      expect(resolves[0]).toHaveBeenCalledWith({ item: { id: '1', name: 'Individual 1' }, marker: undefined })
      expect(resolves[1]).toHaveBeenCalledWith({ item: { id: '2', name: 'Individual 2' }, marker: undefined })
    })

    it('rejects only the failing op in fallback — others still resolve', async () => {
      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        if (payload.key === '2') {
          throw new Error('Fetch failed for key 2')
        }
        payload.setResult({ id: payload.key, name: `Item ${payload.key}` })
      })

      const resolves = [vi.fn(), vi.fn()]
      const rejects = [vi.fn(), vi.fn()]
      await flushFetchBatch(mockStore, fetchOps([
        { collection, key: '1', resolve: resolves[0], reject: rejects[0] },
        { collection, key: '2', resolve: resolves[1], reject: rejects[1] },
      ]))

      expect(resolves[0]).toHaveBeenCalledWith({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(rejects[1]).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('error handling', () => {
    it('rejects every unresolved op when batchFetch hook throws', async () => {
      mockStore.$hooks.hook('batchFetch', () => {
        throw new Error('Batch fetch failed')
      })

      const rejects = [vi.fn(), vi.fn()]
      await flushFetchBatch(mockStore, fetchOps([
        { collection, key: '1', resolve: vi.fn(), reject: rejects[0] },
        { collection, key: '2', resolve: vi.fn(), reject: rejects[1] },
      ]))

      expect(rejects[0]).toHaveBeenCalledWith(expect.any(Error))
      expect(rejects[1]).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('integration with scheduler', () => {
    it('batches findFirst calls from the same tick via scheduler', async () => {
      const batchFetchSpy = vi.fn((payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key, name: `Item ${op.key}` })
        }
      })
      mockStore.$hooks.hook('batchFetch', batchFetchSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const p1 = scheduler.enqueueFetchFirst(collection, '1', { key: '1' } as any, {})
      const p2 = scheduler.enqueueFetchFirst(collection, '2', { key: '2' } as any, {})
      const p3 = scheduler.enqueueFetchFirst(collection, '3', { key: '3' } as any, {})

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])

      expect(batchFetchSpy).toHaveBeenCalledOnce()
      expect(r1).toEqual({ item: { id: '1', name: 'Item 1' }, marker: undefined })
      expect(r2).toEqual({ item: { id: '2', name: 'Item 2' }, marker: undefined })
      expect(r3).toEqual({ item: { id: '3', name: 'Item 3' }, marker: undefined })
    })
  })
})
