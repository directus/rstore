import { randomUUID } from 'node:crypto'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { connectRstoreDevtools } from '../src/node/connect'
import { openRelayRpc } from '../src/node/rpc'
import { createSSRWorker } from '../src/node/ssr'
import { createRstoreDevtools } from '../src/runtime'
import { captureSSRSnapshot } from '../src/ssr/snapshot'
import { openViewer, startRelay, waitFor } from './utils/relay'

describe('private SSR producer transport', () => {
  // Actual official wire and real Core/cache: incorrect auth or action routing
  // would expose data authority or alter existing request cache rows.
  it('routes isolated live reads, denies actions, then serves detached completed data', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const worker = createSSRWorker({ baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(worker.dispose)
    const viewer = await openViewer(host)
    onTestFinished(() => viewer.$close())
    const runtimes = ['alpha', 'beta'].map(label => createRstoreDevtools({ kind: 'ssr', label, request: { path: `/${label}`, method: 'GET', startedAt: Date.now(), status: 'active' } }))
    for (const runtime of runtimes)
      onTestFinished(runtime.dispose)
    const stacks = await Promise.all(runtimes.map(runtime => createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'items' }], plugins: [runtime.plugin({ id: 'default' })] })))
    const targets = runtimes.map(runtime => runtime.listStores()[0]!.target)
    const detach = runtimes.map(runtime => worker.attach(runtime)!)
    stacks.forEach((stack, index) => stack.cache.writeItem({ collection: stack.collection('items'), key: 0, item: { id: 0, title: ['alpha', 'beta'][index] } }))
    await waitFor(async () => (await viewer.$call('rstore:list-sessions', {})).length === 2)
    const active = await viewer.$call('rstore:list-sessions', {})
    expect(active.map((session: { request: { path: string, status: string } }) => session.request.path).sort()).toEqual(['/alpha', '/beta'])
    expect(active.every((session: { request: { status: string } }) => session.request.status === 'active')).toBe(true)
    await expect(viewer.$call('rstore:write-cache-item', { action: 'write-cache-item', target: targets[0], commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 0, title: 'forbidden' } })).rejects.toThrow('read-only')
    expect(stacks[0]!.read('items', 0)?.title).toBe('alpha')
    expect(stacks[1]!.read('items', 0)?.title).toBe('beta')
    for (const [index, runtime] of runtimes.entries()) {
      const record = captureSSRSnapshot(runtime, { path: `/${['alpha', 'beta'][index]}`, method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'completed' })
      worker.complete(record)
      detach[index]!()
      runtime.dispose()
      stacks[index]!.dispose()
    }
    await waitFor(async () => (await viewer.$call('rstore:list-sessions', {})).filter((session: { completed: boolean }) => session.completed).length === 2)
    for (const [index, target] of targets.entries()) {
      const cache = await viewer.$call('rstore:get-cache', { target, collection: 'items' })
      expect(JSON.stringify(cache.data.rows)).toContain(['alpha', 'beta'][index])
      expect(cache.data.rows.map((row: { key: unknown }) => row.key)).toEqual([0])
    }
    await expect(viewer.$call('rstore:clear-cache', { action: 'clear-cache', target: targets[1], commandId: randomUUID(), issuedAt: Date.now() })).rejects.toThrow('read-only')
  })

  it('requires separate SSR credential for completed snapshot publication', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const wrongRole = await openRelayRpc({ baseURL: host.baseURL, authToken: host.nodeToken })
    onTestFinished(wrongRole.close)
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const record = captureSSRSnapshot(runtime, { path: '/no-store', method: 'GET', startedAt: Date.now(), completedAt: Date.now(), status: 'error' })
    await expect(wrongRole.rpc.$call('rstore:producer-ssr-snapshot', record)).rejects.toThrow('SSR producer credential')
    expect(await wrongRole.rpc.$call('rstore:list-sessions', {})).toEqual([])
  })

  it('rejects connected foreign owners and foreign view authority before retaining snapshots', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const stack = await createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'items' }] })
    const node = createRstoreDevtools({ kind: 'node' })
    const ssr = createRstoreDevtools({ kind: 'ssr' })
    const forged = createRstoreDevtools({ kind: 'ssr', sessionId: node.session.sessionId })
    const own = createRstoreDevtools({ kind: 'ssr' })
    for (const runtime of [node, ssr, forged, own]) {
      onTestFinished(runtime.dispose)
      runtime.attachStore(stack.store, { id: 'default' })
    }
    const nodeConnection = connectRstoreDevtools(node, { baseURL: host.baseURL, authToken: host.nodeToken })
    const ssrConnection = connectRstoreDevtools(ssr, { baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(nodeConnection.dispose)
    onTestFinished(ssrConnection.dispose)
    await Promise.all([nodeConnection.ready, ssrConnection.ready])
    const attacker = await openRelayRpc({ baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(attacker.close)
    const metadata = { path: '/authority', method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'completed' as const }
    const records = [captureSSRSnapshot(forged, metadata), captureSSRSnapshot(ssr, metadata), captureSSRSnapshot(own, metadata), captureSSRSnapshot(own, metadata)]
    records[2]!.views.history!.target.sessionId = 'foreign-session'
    records[3]!.views.history!.target.generation++
    const failures = await Promise.all(records.map(async (record) => {
      try {
        await attacker.rpc.$call('rstore:producer-ssr-snapshot', record)
      }
      catch (error) {
        return (error as Error).message
      }
    }))
    expect(failures).toEqual([
      'SSR worker does not own this session',
      'SSR worker does not own this session',
      'SSR capture view target differs from request',
      'SSR capture view target differs from request',
    ])
    const sessions = await attacker.rpc.$call('rstore:list-sessions', {})
    expect(sessions.find((session: { sessionId: string }) => session.sessionId === node.session.sessionId)).toMatchObject({ kind: 'node', connected: true, completed: false })
    expect(sessions.find((session: { sessionId: string }) => session.sessionId === ssr.session.sessionId)).toMatchObject({ kind: 'ssr', connected: true, completed: false })
  })

  it('accepts current live owner publication and keeps completed identity immutable across workers', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const connection = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(connection.dispose)
    await connection.ready
    const record = captureSSRSnapshot(runtime, { path: '/immutable', method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'completed' })
    await connection.call('rstore:producer-ssr-snapshot', record)
    const other = await openRelayRpc({ baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(other.close)
    // Identical reconnect publication is harmless and never extends completion TTL.
    await other.rpc.$call('rstore:producer-ssr-snapshot', record)
    const changed = JSON.parse(JSON.stringify(record))
    changed.request.completedAt++
    changed.session.completedAt++
    changed.request.path = '/forged'
    changed.session.request = { ...changed.request }
    await expect(other.rpc.$call('rstore:producer-ssr-snapshot', changed)).rejects.toThrow('immutable')
    const sessions = await other.rpc.$call('rstore:list-sessions', {})
    expect(sessions[0].completedAt).toBe(record.request.completedAt)
  })

  it('limits active admission and buffers only newest detached records during relay outage', async () => {
    const host = await startRelay()
    const baseURL = host.baseURL
    const authToken = host.ssrToken
    await host.close()
    const worker = createSSRWorker({ baseURL, authToken })
    onTestFinished(worker.dispose)
    const runtimes = Array.from({ length: 51 }, () => createRstoreDevtools({ kind: 'ssr' }))
    runtimes.forEach(runtime => onTestFinished(runtime.dispose))
    const handles = runtimes.map(runtime => worker.attach(runtime))
    expect(handles.slice(0, 50).every(Boolean)).toBe(true)
    expect(handles[50]).toBeUndefined()
    expect(worker.activeCount).toBe(50)
    expect(worker.droppedCount).toBe(1)
    for (const [index, runtime] of runtimes.entries()) {
      const record = captureSSRSnapshot(runtime, { path: `/outage/${index}`, method: 'GET', startedAt: Date.now(), completedAt: Date.now(), status: 'completed' })
      worker.complete(record)
      handles[index]?.()
      runtime.dispose()
    }
    expect(worker.activeCount).toBe(0)
    expect(worker.snapshots).toHaveLength(50)
    expect(worker.snapshots.some(record => record.session.sessionId === runtimes[0]!.session.sessionId)).toBe(false)
    expect(worker.snapshots.some(record => record.session.sessionId === runtimes[50]!.session.sessionId)).toBe(true)
  })

  it('discovers failed request metadata without a store and rejects contradictory publication', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const producer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.ssrToken })
    onTestFinished(producer.close)
    const runtime = createRstoreDevtools({ kind: 'ssr' })
    onTestFinished(runtime.dispose)
    const record = captureSSRSnapshot(runtime, { path: '/failed?credential=secret', method: 'POST', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'error', error: new Error('Store initialization failed') })
    const contradictory = JSON.parse(JSON.stringify(record))
    contradictory.session.request = { ...record.request, status: 'completed' }
    await expect(producer.rpc.$call('rstore:producer-ssr-snapshot', contradictory)).rejects.toThrow('Invalid completed SSR authority')
    await producer.rpc.$call('rstore:producer-ssr-snapshot', record)
    runtime.dispose()
    const sessions = await producer.rpc.$call('rstore:list-sessions', {})
    expect(sessions).toMatchObject([{ stores: [], request: { path: '/failed', method: 'POST', status: 'error' } }])
    expect(JSON.stringify(sessions)).toContain('Store initialization failed')
    expect(JSON.stringify(sessions)).not.toContain('credential')
  })
})
