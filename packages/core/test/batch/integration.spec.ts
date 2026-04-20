import type { Collection, CollectionDefaults, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushMutationBatch } from '../../src/batch/flushMutation'
import { createMutationOperation } from '../../src/batch/operations'
import { createBatchScheduler } from '../../src/batch/scheduler'
import { createItem } from '../../src/mutation/create'
import { updateItem } from '../../src/mutation/update'
import { findFirst } from '../../src/query/findFirst'

/**
 * End-to-end regression tests that exercise the batch scheduler
 * through the real `createItem` / `updateItem` / `findFirst` entry points.
 *
 * These tests cover the fixes:
 *  - findFirst batching still runs `beforeFetch` / `afterFetch` hooks
 *  - findFirst batching respects `fetchPolicy: 'no-cache'`
 *  - mutations are not parsed twice when routed through batching
 */
describe('batching integration', () => {
  let mockStore: StoreCore<StoreSchema, CollectionDefaults>
  let collection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>

  beforeEach(() => {
    mockStore = {
      $hooks: createHooks(),
      $cache: {
        writeItem: vi.fn(),
        readItem: vi.fn(),
        readItems: vi.fn(() => []),
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
        wrapItem: vi.fn(({ item }: any) => item),
      },
      $resolveFindOptions: (_c: any, options: any) => ({
        fetchPolicy: options.fetchPolicy ?? 'fetch-only',
        ...options,
      }),
      $processItemParsing: vi.fn(),
      $processItemSerialization: vi.fn(),
      $dedupePromises: new Map(),
      $mutationHistory: [],
    } as any

    collection = {
      name: 'Test',
      getKey: (item: any) => item?.id,
    } as any
  })

  describe('findFirst + batching', () => {
    it('runs beforeFetch and afterFetch hooks around the batched enqueue', async () => {
      const beforeFetchSpy = vi.fn()
      const afterFetchSpy = vi.fn()
      mockStore.$hooks.hook('beforeFetch', beforeFetchSpy)
      mockStore.$hooks.hook('afterFetch', afterFetchSpy)
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key, name: `Item ${op.key}` })
        }
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await findFirst({ store: mockStore, collection, findOptions: { key: '1' } })

      expect(beforeFetchSpy).toHaveBeenCalledOnce()
      expect(afterFetchSpy).toHaveBeenCalledOnce()
      // afterFetch must see the item returned by the batch
      const afterPayload = afterFetchSpy.mock.calls[0]![0] as any
      expect(afterPayload.getResult()).toEqual({ id: '1', name: 'Item 1' })
    })

    it('lets beforeFetch.updateFindOptions mutate options that reach the batch', async () => {
      let batchPayload: any
      mockStore.$hooks.hook('beforeFetch', (payload: any) => {
        payload.updateFindOptions({ params: { lang: 'fr' } })
      })
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        batchPayload = payload
        for (const op of payload.operations) {
          op.setResult({ id: op.key })
        }
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await findFirst({ store: mockStore, collection, findOptions: { key: '1' } })

      expect(batchPayload.operations[0].findOptions.params).toEqual({ lang: 'fr' })
    })

    it('does NOT write to cache when fetchPolicy is "no-cache"', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key })
        }
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1', fetchPolicy: 'no-cache' },
      })

      expect(mockStore.$cache.writeItem).not.toHaveBeenCalled()
    })

    it('writes to cache when fetchPolicy allows it', async () => {
      mockStore.$hooks.hook('batchFetch', (payload: any) => {
        for (const op of payload.operations) {
          op.setResult({ id: op.key })
        }
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1', fetchPolicy: 'fetch-only' },
      })

      expect(mockStore.$cache.writeItem).toHaveBeenCalledOnce()
      expect(mockStore.$cache.writeItem).toHaveBeenCalledWith(expect.objectContaining({
        collection,
        key: '1',
        item: { id: '1' },
      }))
    })

    it('respects per-call `batch: false` to bypass the scheduler', async () => {
      const enqueueSpy = vi.fn()
      mockStore.$batch = {
        enqueueFetchFirst: enqueueSpy,
        enqueueCreate: vi.fn(),
        enqueueUpdate: vi.fn(),
        enqueueDelete: vi.fn(),
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any
      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        payload.setResult({ id: '1' })
      })

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1', batch: false },
      })

      expect(enqueueSpy).not.toHaveBeenCalled()
    })
  })

  describe('mutations + batching', () => {
    it('calls $processItemParsing exactly once for a batched create (no double parse)', async () => {
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations.forEach((op: any, i: number) => {
          op.setResult({ id: `gen-${i}`, ...op.item })
        })
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await createItem({
        store: mockStore,
        collection,
        item: { name: 'A' } as any,
        optimistic: false,
      })

      // parse runs once on the final result inside createItem, never inside the scheduler
      expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(1)
    })

    it('calls $processItemParsing exactly once for a batched update', async () => {
      mockStore.$cache.readItem = vi.fn(() => null) as any
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations.forEach((op: any) => {
          op.setResult({ id: op.key, ...op.item })
        })
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await updateItem({
        store: mockStore,
        collection,
        key: '1',
        item: { name: 'B' } as any,
        optimistic: false,
      })

      expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(1)
    })

    it('also avoids double parse when batchMutate is not handled and we fall back to individual hooks', async () => {
      // No batchMutate hook — fallback to createItem.
      mockStore.$hooks.hook('createItem', (payload: any) => {
        payload.setResult({ id: 'gen-1', ...payload.item })
      })

      const scheduler = createBatchScheduler(mockStore, {})
      mockStore.$batch = scheduler

      await createItem({
        store: mockStore,
        collection,
        item: { name: 'A' } as any,
        optimistic: false,
      })

      expect(mockStore.$processItemParsing).toHaveBeenCalledTimes(1)
    })

    it('flushMutationBatch never parses internally — guard against regressing the fix', async () => {
      const processSpy = mockStore.$processItemParsing as any
      mockStore.$hooks.hook('batchMutate', (payload: any) => {
        payload.operations[0].setResult({ id: '1' })
      })

      const resolve = vi.fn()
      const op = createMutationOperation({
        type: 'create',
        collection,
        item: { name: 'x' },
        meta: {},
        resolve,
        reject: vi.fn(),
      })

      await flushMutationBatch(mockStore, [op])

      expect(processSpy).not.toHaveBeenCalled()
      expect(resolve).toHaveBeenCalledWith({ id: '1' })
    })
  })
})
