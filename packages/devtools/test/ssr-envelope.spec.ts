import type { CacheInspectionCollection } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'
import { createSSRRetention } from '../src/ssr/retention'
import { captureSSRSnapshot, finalizeSSRSnapshot, readSSRSnapshot, SSR_SNAPSHOT_BYTES } from '../src/ssr/snapshot'

/** Actual Core registration/capture/retention; custom adapter is supported extension boundary. */
describe('sSR fault containment and envelope', () => {
  it.each(['reader', 'iterator'] as const)('retains healthy neighboring store when cache %s fails', async (failure) => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const first = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }] })
    runtime.attachStore(first.store, { id: 'broken', adapter: { readCache: () => {
      if (failure === 'reader')
        throw new Error('Cache temporarily unavailable')
      const collections: CacheInspectionCollection[] = []
      collections[Symbol.iterator] = function* () {
        throw new Error('Collection enumeration failed')
      }
      return { collections, layers: () => [], metadata: () => null }
    } } })
    const second = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id: 'healthy' })] })
    second.cache.writeItem({ collection: second.collection('todos'), key: 'kept', item: { id: 'kept', title: 'Healthy capture' } })
    const target = runtime.listStores()[1]!.target
    const record = captureSSRSnapshot(runtime, { path: '/fault?secret=hidden', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    runtime.dispose()
    expect(record.truncated).toBe(true)
    expect(record.request).toEqual({ path: '/fault', method: 'GET', startedAt: 100, completedAt: 200, duration: 100, status: 'completed' })
    expect(record.session.stores.map(store => store.target.storeId)).toEqual(['broken', 'healthy'])
    expect(readSSRSnapshot(record, { method: 'rstore:get-cache', target, collection: 'todos' })).toMatchObject({ data: { rows: [{ key: 'kept', value: { kind: 'object', entries: [['id', 'kept'], ['title', 'Healthy capture']] } }] } })
  })

  it.each([false, true])('retains bounded snapshot with oversized labels and stores=%s', async (withStore) => {
    const runtime = createRstoreDevtools({ kind: 'ssr', sessionId: 'exact-session', label: '\u0000'.repeat(SSR_SNAPSHOT_BYTES) })
    onTestFinished(runtime.dispose)
    if (withStore)
      await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id: 'exact-store', label: '雪'.repeat(SSR_SNAPSHOT_BYTES) })] })
    const record = captureSSRSnapshot(runtime, { path: '/labels', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    finalizeSSRSnapshot(record, 'error', new Error('Failure '.repeat(100_000)), 250)
    expect(record.truncated).toBe(true)
    expect(record.session.request).toEqual(record.request)
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(SSR_SNAPSHOT_BYTES)
    expect(record.target).toEqual({ sessionId: 'exact-session', storeId: withStore ? 'exact-store' : 'default', generation: 1 })
    const retention = createSSRRetention({ now: () => 250 })
    onTestFinished(retention.dispose)
    retention.add(record)
    expect(retention.get('exact-session')).toEqual(record)
  })

  it('rejects unrepresentable identity without rewriting authority', () => {
    const sessionId = 'i'.repeat(SSR_SNAPSHOT_BYTES)
    const runtime = createRstoreDevtools({ kind: 'ssr', sessionId })
    onTestFinished(runtime.dispose)
    expect(() => captureSSRSnapshot(runtime, { path: '/identity', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })).toThrow('SSR identity exceeds metadata byte budget')
    expect(runtime.session.sessionId).toBe(sessionId)
  })
})
