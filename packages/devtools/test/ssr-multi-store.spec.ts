import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'
import { captureSSRSnapshot, readSSRSnapshot, SSR_SNAPSHOT_BYTES } from '../src/ssr/snapshot'

/** Capture every advertised store through actual Core ownership and detached readers. */
describe('sSR multi-store capture', () => {
  it('retains distinct store views after both live stores are disposed', async () => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    for (const id of ['first', 'second']) {
      const stack = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id })] })
      onTestFinished(stack.dispose)
      stack.cache.writeItem({ collection: stack.collection('todos'), key: id, item: { id, title: `${id} title` } })
    }
    const targets = runtime.listStores().map(store => store.target)
    const record = captureSSRSnapshot(runtime, { path: '/both', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    runtime.dispose()
    for (const target of targets) {
      const reply = readSSRSnapshot(record, { method: 'rstore:get-cache', target, collection: 'todos' }) as { data: { rows: { key: string }[] } }
      expect(reply.data.rows.map(row => row.key)).toEqual([target.storeId])
      expect(() => readSSRSnapshot(record, { method: 'rstore:get-cache', target: { ...target, generation: 2 }, collection: 'todos' })).toThrow('Recorded target unavailable')
    }
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(SSR_SNAPSHOT_BYTES)
  })

  it('shares capture allowance across stores while preserving later target discovery', async () => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    for (const id of ['first', 'second']) {
      const stack = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id })] })
      onTestFinished(stack.dispose)
      for (let key = 0; key < 70; key++)
        stack.cache.writeItem({ collection: stack.collection('todos'), key, item: { id: key, title: `${id}${'x'.repeat(8192)}` } })
    }
    const targets = runtime.listStores().map(store => store.target)
    const record = captureSSRSnapshot(runtime, { path: '/large', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    runtime.dispose()
    expect(record.truncated).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(SSR_SNAPSHOT_BYTES)
    expect(readSSRSnapshot(record, { method: 'rstore:list-stores', sessionId: runtime.session.sessionId })).toHaveLength(2)
    expect(readSSRSnapshot(record, { method: 'rstore:get-cache', target: targets[1]!, collection: 'todos' })).toMatchObject({ target: targets[1], truncated: true })
  })
})
