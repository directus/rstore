import type { StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushMutationBatch } from '../../src/batch/flushMutation'
import { createMutationOperation } from '../../src/batch/operations'
import { createBatchScheduler } from '../../src/batch/scheduler'

/**
 * Build an array of mutation operations from raw entry data.
 */
function mutationOps(entries: Array<{ type: 'create' | 'update' | 'delete', collection: any, key?: string | number, item?: any, resolve: any, reject: any }>) {
  return entries.map(e => createMutationOperation({
    type: e.type,
    collection: e.collection,
    key: e.key,
    item: e.item,
    meta: {},
    resolve: e.resolve,
    reject: e.reject,
  }))
}

describe('mutationBatch', () => {
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

  describe('batchMutate hook - create', () => {
    it('resolves each create op via its per-op setResult', async () => {
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations.forEach((op: any, i: number) => {
          op.setResult({ id: String(i + 1), ...op.item })
        })
      })
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const resolves = [vi.fn(), vi.fn()]
      const ops = mutationOps([
        { type: 'create', collection, item: { name: 'New 1' }, resolve: resolves[0], reject: vi.fn() },
        { type: 'create', collection, item: { name: 'New 2' }, resolve: resolves[1], reject: vi.fn() },
      ])

      await flushMutationBatch(mockStore, ops)

      expect(batchMutateSpy).toHaveBeenCalledOnce()
      expect(batchMutateSpy.mock.calls[0]![0].mutation).toBe('create')
      expect(resolves[0]).toHaveBeenCalledWith({ id: '1', name: 'New 1' })
      expect(resolves[1]).toHaveBeenCalledWith({ id: '2', name: 'New 2' })
    })
  })

  describe('batchMutate hook - update', () => {
    it('resolves each update op via its per-op setResult', async () => {
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations.forEach((op: any) => {
          op.setResult({ id: op.key, ...op.item })
        })
      })
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const resolves = [vi.fn(), vi.fn()]
      const ops = mutationOps([
        { type: 'update', collection, key: '1', item: { name: 'U1' }, resolve: resolves[0], reject: vi.fn() },
        { type: 'update', collection, key: '2', item: { name: 'U2' }, resolve: resolves[1], reject: vi.fn() },
      ])

      await flushMutationBatch(mockStore, ops)

      expect(batchMutateSpy).toHaveBeenCalledOnce()
      expect(batchMutateSpy.mock.calls[0]![0].mutation).toBe('update')
      expect(resolves[0]).toHaveBeenCalledWith({ id: '1', name: 'U1' })
      expect(resolves[1]).toHaveBeenCalledWith({ id: '2', name: 'U2' })
    })
  })

  describe('batchMutate hook - delete', () => {
    it('resolves each delete op with undefined via its per-op setResult', async () => {
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations.forEach((op: any) => op.setResult(undefined))
      })
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const resolves = [vi.fn(), vi.fn()]
      const ops = mutationOps([
        { type: 'delete', collection, key: '1', resolve: resolves[0], reject: vi.fn() },
        { type: 'delete', collection, key: '2', resolve: resolves[1], reject: vi.fn() },
      ])

      await flushMutationBatch(mockStore, ops)

      expect(batchMutateSpy).toHaveBeenCalledOnce()
      expect(batchMutateSpy.mock.calls[0]![0].mutation).toBe('delete')
      expect(resolves[0]).toHaveBeenCalledWith(undefined)
      expect(resolves[1]).toHaveBeenCalledWith(undefined)
    })
  })

  describe('partial handling with fall-through', () => {
    it('plugin resolves some ops — unresolved ops fall back to individual createItem', async () => {
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        // Only resolve the first op
        payload.operations[0].setResult({ id: 'batched-1', name: payload.operations[0].item.name })
      })
      mockStore.$hooks.hook('createItem', (payload: any) => {
        payload.setResult({ id: 'fallback', ...payload.item })
      })

      const resolves = [vi.fn(), vi.fn()]
      const ops = mutationOps([
        { type: 'create', collection, item: { name: 'A' }, resolve: resolves[0], reject: vi.fn() },
        { type: 'create', collection, item: { name: 'B' }, resolve: resolves[1], reject: vi.fn() },
      ])

      await flushMutationBatch(mockStore, ops)

      expect(resolves[0]).toHaveBeenCalledWith({ id: 'batched-1', name: 'A' })
      expect(resolves[1]).toHaveBeenCalledWith({ id: 'fallback', name: 'B' })
    })

    it('op.setError rejects just that op without affecting siblings', async () => {
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations[0].setResult({ id: 'ok' })
        payload.operations[1].setError(new Error('only this one failed'))
      })

      const resolves = [vi.fn(), vi.fn()]
      const rejects = [vi.fn(), vi.fn()]
      const ops = mutationOps([
        { type: 'create', collection, item: { name: 'A' }, resolve: resolves[0], reject: rejects[0] },
        { type: 'create', collection, item: { name: 'B' }, resolve: resolves[1], reject: rejects[1] },
      ])

      await flushMutationBatch(mockStore, ops)

      expect(resolves[0]).toHaveBeenCalledWith({ id: 'ok' })
      expect(rejects[1]).toHaveBeenCalledWith(expect.any(Error))
      expect(rejects[0]).not.toHaveBeenCalled()
      expect(resolves[1]).not.toHaveBeenCalled()
    })
  })

  describe('fallback to individual hooks', () => {
    it('falls back to createItem when batchMutate is not registered', async () => {
      mockStore.$hooks.hook('createItem', (payload: any) => {
        payload.setResult({ id: 'gen-1', ...payload.item })
      })

      const resolve = vi.fn()
      await flushMutationBatch(mockStore, mutationOps([
        { type: 'create', collection, item: { name: 'New' }, resolve, reject: vi.fn() },
      ]))

      expect(resolve).toHaveBeenCalledWith({ id: 'gen-1', name: 'New' })
    })

    it('falls back to updateItem when batchMutate is not registered', async () => {
      mockStore.$hooks.hook('updateItem', (payload: any) => {
        payload.setResult({ id: payload.key, ...payload.item })
      })

      const resolve = vi.fn()
      await flushMutationBatch(mockStore, mutationOps([
        { type: 'update', collection, key: '1', item: { name: 'Updated' }, resolve, reject: vi.fn() },
      ]))

      expect(resolve).toHaveBeenCalledWith({ id: '1', name: 'Updated' })
    })

    it('falls back to deleteItem when batchMutate is not registered', async () => {
      const deleteItemSpy = vi.fn()
      mockStore.$hooks.hook('deleteItem', deleteItemSpy)

      const resolve = vi.fn()
      await flushMutationBatch(mockStore, mutationOps([
        { type: 'delete', collection, key: '1', resolve, reject: vi.fn() },
      ]))

      expect(deleteItemSpy).toHaveBeenCalledOnce()
      expect(resolve).toHaveBeenCalledWith(undefined)
    })

    it('only the failing op is rejected in fallback — others resolve', async () => {
      mockStore.$hooks.hook('createItem', (payload: any) => {
        if (payload.item.name === 'Bad') {
          throw new Error('Create failed')
        }
        payload.setResult({ id: 'gen-1', ...payload.item })
      })

      const resolves = [vi.fn(), vi.fn()]
      const rejects = [vi.fn(), vi.fn()]
      await flushMutationBatch(mockStore, mutationOps([
        { type: 'create', collection, item: { name: 'Good' }, resolve: resolves[0], reject: rejects[0] },
        { type: 'create', collection, item: { name: 'Bad' }, resolve: resolves[1], reject: rejects[1] },
      ]))

      expect(resolves[0]).toHaveBeenCalled()
      expect(rejects[1]).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('error handling', () => {
    it('rejects every unresolved op when batchMutate throws', async () => {
      mockStore.$hooks.hook('batchMutate', () => {
        throw new Error('Batch mutate failed')
      })

      const rejects = [vi.fn(), vi.fn()]
      await flushMutationBatch(mockStore, mutationOps([
        { type: 'create', collection, item: { name: 'New 1' }, resolve: vi.fn(), reject: rejects[0] },
        { type: 'create', collection, item: { name: 'New 2' }, resolve: vi.fn(), reject: rejects[1] },
      ]))

      expect(rejects[0]).toHaveBeenCalledWith(expect.any(Error))
      expect(rejects[1]).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('integration with scheduler', () => {
    it('batches create mutations from the same tick', async () => {
      const batchMutateSpy = vi.fn((payload: any) => {
        payload.operations.forEach((op: any, i: number) => {
          op.setResult({ id: `gen-${i}`, ...op.item })
        })
      })
      mockStore.$hooks.hook('batchMutate', batchMutateSpy)

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      const p1 = scheduler.enqueueCreate(collection, { name: 'A' }, {})
      const p2 = scheduler.enqueueCreate(collection, { name: 'B' }, {})

      const [r1, r2] = await Promise.all([p1, p2])

      expect(batchMutateSpy).toHaveBeenCalledOnce()
      expect(r1).toEqual({ id: 'gen-0', name: 'A' })
      expect(r2).toEqual({ id: 'gen-1', name: 'B' })
    })
  })
})
