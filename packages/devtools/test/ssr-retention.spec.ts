import type { SSRSnapshot } from '../src/ssr/types'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createError } from 'h3'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'
import { createSSRRetention } from '../src/ssr/retention'
import { captureSSRSnapshot, finalizeSSRSnapshot, readSSRSnapshot } from '../src/ssr/snapshot'

/** Valid detached capture, independent of the retention implementation. */
function snapshot(id: string, completedAt: number, padding = ''): SSRSnapshot {
  const target = { sessionId: id, storeId: 'default', generation: 1 }
  return {
    session: { sessionId: id, kind: 'ssr', label: id, connected: false, completed: true, startedAt: completedAt - 10, completedAt, stores: [] },
    request: { path: `/${id}`, method: 'GET', startedAt: completedAt - 10, completedAt, duration: 10, status: 'completed' },
    target,
    views: { modules: { target, revision: 0, data: [{ name: padding }], truncated: false } },
    truncated: false,
  }
}

describe('sSR detached retention', () => {
  // Retention is a bounded eviction algorithm; an explicit clock makes mixed-age
  // records decisive without substituting request/store lifecycle behavior.
  it('retains newest records, expires only old records, and detaches ownership', () => {
    let now = 1000
    const ledger = createSSRRetention({ maxRecords: 2, ttlMs: 100, now: () => now })
    onTestFinished(ledger.dispose)
    ledger.add(snapshot('first', 920))
    const source = snapshot('second', 970)
    ledger.add(source)
    expect(() => ledger.add(snapshot('second', 980))).toThrow('immutable')
    source.request.path = '/changed'
    ledger.add(snapshot('third', 1000))
    expect(ledger.list().map(record => record.session.sessionId)).toEqual(['third', 'second'])
    expect(ledger.get('second')?.request.path).toBe('/second')
    ledger.get('second')!.request.path = '/caller-change'
    expect(ledger.get('second')?.request.path).toBe('/second')
    now = 1075
    expect(ledger.list().map(record => record.session.sessionId)).toEqual(['third'])
    ledger.dispose()
    ledger.dispose()
    expect(ledger.list()).toEqual([])
    expect(() => ledger.add(snapshot('late', now))).toThrow('disposed')
  })

  it('evicts oldest by encoded byte cost and rejects oversized captures', () => {
    const ledger = createSSRRetention({ maxBytes: 1500, maxSnapshotBytes: 1000, now: () => 1000 })
    onTestFinished(ledger.dispose)
    ledger.add(snapshot('older', 999, 'x'.repeat(300)))
    ledger.add(snapshot('newer', 1000, 'y'.repeat(300)))
    expect(ledger.list().map(record => record.session.sessionId)).toEqual(['newer'])
    expect(ledger.bytes).toBeLessThanOrEqual(1500)
    expect(() => ledger.add(snapshot('huge', 1000, 'z'.repeat(1100)))).toThrow('budget')
    expect(ledger.list().map(record => record.session.sessionId)).toEqual(['newer'])
  })

  it('captures isolated actual Core stores, rejects stale targets, and retains no live values', async () => {
    const records: SSRSnapshot[] = []
    for (const id of ['alpha', 'beta']) {
      const runtime = createRstoreDevtools({ kind: 'ssr', sessionId: id })
      onTestFinished(runtime.dispose)
      const stack = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id: 'default' })] })
      stack.cache.writeItem({ collection: stack.collection('todos'), key: 0, item: { id: 0, title: id } })
      const target = runtime.listStores()[0]!.target
      expect(runtime.resolve(target).readOnly).toBe(true)
      const record = captureSSRSnapshot(runtime, { path: `/${id}?token=secret`, method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
      records.push(record)
      runtime.dispose()
      stack.cache.writeItem({ collection: stack.collection('todos'), key: 0, item: { id: 0, title: 'later' } })
      stack.dispose()
      expect(record.request.path).toBe(`/${id}`)
      const cache = readSSRSnapshot(record, { method: 'rstore:get-cache', target, collection: 'todos' })
      expect(JSON.stringify(cache)).toContain(id)
      expect(JSON.stringify(cache)).not.toContain('later')
      expect(readSSRSnapshot(record, { method: 'rstore:get-cache', target, collection: 'constructor' })).toMatchObject({ data: null, unavailable: 'Section not captured' })
      expect(() => readSSRSnapshot(record, { method: 'rstore:get-cache', target: { ...target, generation: 2 }, collection: 'todos' })).toThrow()
    }
    expect(JSON.stringify(records[0])).not.toContain('beta')
    expect(JSON.stringify(records[1])).not.toContain('alpha')
  })

  it('bounds traversal of large real cache captures across every section', async () => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const stack = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'todos' }], plugins: [runtime.plugin({ id: 'default' })] })
    for (let key = 0; key < 700; key++)
      stack.cache.writeItem({ collection: stack.collection('todos'), key, item: { id: key, title: 'x'.repeat(8192) } })
    const record = captureSSRSnapshot(runtime, { path: '/large', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    stack.dispose()
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(512 * 1024)
    expect(record.truncated).toBe(true)
    const reply = readSSRSnapshot(record, { method: 'rstore:get-cache', target: record.target, collection: 'todos' }) as { data: { total: number, rows: unknown[] } }
    expect(reply.data.total).toBe(700)
    expect(reply.data.rows.length).toBeGreaterThan(0)
    expect(reply.data.rows.length).toBeLessThan(500)
    finalizeSSRSnapshot(record, 'error', new Error('x'.repeat(100_000)))
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(512 * 1024)
    expect(record.session.request).toEqual(record.request)
    // ~3s locally (5.6 MB of rows); coverage instrumentation on CI exceeds the 5s default.
  }, 30_000)

  it('exposes detached terminal request metadata when store creation never completed', () => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const record = captureSSRSnapshot(runtime, { path: '/failed?credential=secret', method: 'GET', startedAt: 100, completedAt: 200, status: 'completed' })
    finalizeSSRSnapshot(record, 'error', new Error('Store initialization failed'), 250)
    runtime.dispose()
    const sessions = readSSRSnapshot(record, { method: 'rstore:list-sessions' })
    expect(sessions).toMatchObject([{ stores: [], request: { path: '/failed', method: 'GET', startedAt: 100, completedAt: 250, duration: 150, status: 'error' } }])
    expect(JSON.stringify(sessions)).toContain('Store initialization failed')
    expect(JSON.stringify(sessions)).not.toContain('credential')
    expect(record.session.request).toEqual(record.request)
  })

  it('keeps H3 failure message/status without retaining request, headers or arbitrary error data', () => {
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const error = createError({ statusCode: 503, statusMessage: 'SSR failure', data: {
      headers: { authorization: 'HEADER_SECRET', cookie: 'COOKIE_SECRET' },
      request: { url: '/failed?token=QUERY_SECRET' },
      payload: 'PAYLOAD_SECRET',
    } })
    const record = captureSSRSnapshot(runtime, { path: '/failed', method: 'GET', startedAt: 100, completedAt: 200, status: 'error', error })
    const captured = JSON.stringify(record.request.error)
    expect(captured).toContain('SSR failure')
    expect(captured).toContain('503')
    expect(captured).not.toContain('SECRET')
    finalizeSSRSnapshot(record, 'error', error, 250)
    const finalized = JSON.stringify(record.session.request)
    expect(finalized).toContain('SSR failure')
    expect(finalized).toContain('503')
    expect(finalized).not.toContain('SECRET')
  })
})
