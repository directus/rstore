import type { StoreCore } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBatchOptions } from '../../src/batch/scheduler'
import { createItem } from '../../src/mutation/create'
import { deleteItem } from '../../src/mutation/delete'
import { updateItem } from '../../src/mutation/update'
import { findFirst } from '../../src/query/findFirst'

vi.mock('../../src/query/peekFirst', () => ({
  peekFirst: vi.fn(() => ({ result: null, marker: undefined })),
}))

describe('batch options', () => {
  describe('resolveBatchOptions', () => {
    it('should apply default values', () => {
      expect(resolveBatchOptions({})).toEqual({
        fetch: true,
        mutations: true,
        delay: 0,
        maxWait: undefined,
        maxSize: Infinity,
      })
    })

    it('should respect provided values', () => {
      expect(resolveBatchOptions({
        fetch: false,
        mutations: false,
        delay: 50,
        maxWait: 200,
        maxSize: 10,
      })).toEqual({
        fetch: false,
        mutations: false,
        delay: 50,
        maxWait: 200,
        maxSize: 10,
      })
    })

    it('should merge partial values with defaults', () => {
      expect(resolveBatchOptions({ delay: 25 })).toEqual({
        fetch: true,
        mutations: true,
        delay: 25,
        maxWait: undefined,
        maxSize: Infinity,
      })
    })
  })

  describe('query-level batch option', () => {
    let mockStore: StoreCore<any, any>
    let collection: any

    beforeEach(() => {
      mockStore = {
        $cache: {
          readItem: vi.fn(),
          readItems: vi.fn(() => []),
          writeItem: vi.fn(),
          wrapItem: vi.fn(({ item }: any) => item),
        },
        $hooks: createHooks(),
        $resolveFindOptions: (_c: any, options: any) => ({
          fetchPolicy: 'fetch-only',
          ...options,
        }),
        $processItemParsing: vi.fn(),
        $dedupePromises: new Map(),
      } as any

      collection = {
        name: 'Test',
        getKey: (item: any) => item.id,
      }
    })

    it('should use batch scheduler when batch is not false', async () => {
      const enqueueSpy = vi.fn(() => Promise.resolve({ id: '1' }))
      mockStore.$batch = {
        enqueueFetchFirst: enqueueSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1' },
      })

      expect(enqueueSpy).toHaveBeenCalledWith(
        collection,
        '1',
        expect.objectContaining({ key: '1' }),
        expect.any(Object),
        undefined,
      )
    })

    it('should skip batch scheduler when batch: false', async () => {
      const enqueueSpy = vi.fn()
      mockStore.$batch = {
        enqueueFetchFirst: enqueueSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      // Use fetchFirst directly
      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        payload.setResult({ id: '1' })
      })

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1', batch: false },
      })

      // Should NOT have used the batch scheduler
      expect(enqueueSpy).not.toHaveBeenCalled()
    })

    it('should pass a custom group from `batch: { group }` to the scheduler', async () => {
      const enqueueSpy = vi.fn(() => Promise.resolve({ id: '1' }))
      mockStore.$batch = {
        enqueueFetchFirst: enqueueSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { key: '1', batch: { group: 'tenantA' } },
      })

      expect(enqueueSpy).toHaveBeenCalledWith(
        collection,
        '1',
        expect.objectContaining({ key: '1' }),
        expect.any(Object),
        'tenantA',
      )
    })

    it('should skip batch scheduler when no key is provided (filter-only)', async () => {
      const enqueueSpy = vi.fn()
      mockStore.$batch = {
        enqueueFetchFirst: enqueueSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      mockStore.$hooks.hook('fetchFirst', (payload: any) => {
        payload.setResult({ id: '2' })
      })

      await findFirst({
        store: mockStore,
        collection,
        findOptions: { filter: (item: any) => item.id === '2' },
      })

      // Should NOT have used batch scheduler (no key)
      expect(enqueueSpy).not.toHaveBeenCalled()
    })
  })

  describe('mutation-level batch option', () => {
    let mockStore: StoreCore<any, any>
    let collection: any

    beforeEach(() => {
      mockStore = {
        $cache: {
          readItem: vi.fn(() => null),
          writeItem: vi.fn(),
          addLayer: vi.fn(),
          removeLayer: vi.fn(),
          deleteItem: vi.fn(),
        },
        $hooks: createHooks(),
        $processItemSerialization: vi.fn(),
        $processItemParsing: vi.fn(),
        $mutationHistory: [],
      } as any

      collection = {
        name: 'Test',
        getKey: (item: any) => item.id,
      }
    })

    it('should pass a custom group to enqueueCreate', async () => {
      const enqueueCreateSpy = vi.fn(() => Promise.resolve({ id: '1', name: 'Created' }))
      mockStore.$batch = {
        enqueueCreate: enqueueCreateSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await createItem({
        store: mockStore,
        collection,
        item: { name: 'New' },
        batch: { group: 'tenantA' },
      })

      expect(enqueueCreateSpy).toHaveBeenCalledWith(
        collection,
        expect.objectContaining({ name: 'New' }),
        expect.any(Object),
        'tenantA',
      )
    })

    it('should pass a custom group to enqueueUpdate', async () => {
      const enqueueUpdateSpy = vi.fn(() => Promise.resolve({ id: '1', name: 'Updated' }))
      mockStore.$batch = {
        enqueueUpdate: enqueueUpdateSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await updateItem({
        store: mockStore,
        collection,
        item: { name: 'Updated' },
        key: '1',
        batch: { group: 'tenantB' },
      })

      expect(enqueueUpdateSpy).toHaveBeenCalledWith(
        collection,
        '1',
        expect.objectContaining({ name: 'Updated' }),
        expect.any(Object),
        'tenantB',
      )
    })

    it('should pass a custom group to enqueueDelete', async () => {
      const enqueueDeleteSpy = vi.fn(() => Promise.resolve())
      mockStore.$batch = {
        enqueueDelete: enqueueDeleteSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await deleteItem({
        store: mockStore,
        collection,
        key: '1',
        batch: { group: 'tenantC' },
      })

      expect(enqueueDeleteSpy).toHaveBeenCalledWith(
        collection,
        '1',
        expect.any(Object),
        'tenantC',
      )
    })

    it('should skip batch scheduler when batch: false on a mutation', async () => {
      const enqueueCreateSpy = vi.fn()
      mockStore.$batch = {
        enqueueCreate: enqueueCreateSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      mockStore.$hooks.hook('createItem', (payload: any) => {
        payload.setResult({ id: '1' })
      })

      await createItem({
        store: mockStore,
        collection,
        item: { name: 'New' },
        batch: false,
      })

      expect(enqueueCreateSpy).not.toHaveBeenCalled()
    })

    it('should pass `undefined` group when batch is `true` (default group)', async () => {
      const enqueueCreateSpy = vi.fn(() => Promise.resolve({ id: '1', name: 'Created' }))
      mockStore.$batch = {
        enqueueCreate: enqueueCreateSpy,
        options: { fetch: true, mutations: true, delay: 0, maxSize: Infinity },
      } as any

      await createItem({
        store: mockStore,
        collection,
        item: { name: 'New' },
        batch: true,
      })

      expect(enqueueCreateSpy).toHaveBeenCalledWith(
        collection,
        expect.any(Object),
        expect.any(Object),
        undefined,
      )
    })
  })
})
