import { randomUUID } from 'node:crypto'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished } from 'vitest'
import { connectRstoreDevtools } from '../src/node'
import { openRelayRpc } from '../src/node/rpc'
import { createRstoreDevtools } from '../src/runtime'
import { openViewer, startRelay, waitFor } from './utils/relay'

// Real boundary: Core + real cache, official Devframe server/client wire. Two
// stores reject wrong-owner writes; role denial must leave existing rows intact.
describe('devframe producer ownership', () => {
  it('routes a viewer write only to exact authenticated Core producer', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const stores = await Promise.all([1, 2].map(() => createCoreStack({ factory: 'core', schema: [{ name: 'items' }], syncImmediately: false })))
    const runtimes = stores.map((_, index) => createRstoreDevtools({ kind: 'node', label: `node-${index}` }))
    runtimes.forEach(runtime => onTestFinished(runtime.dispose))
    const targets = runtimes.map((runtime, index) => runtime.attachStore(stores[index]!.store, { id: 'same' }).target)
    const connections = runtimes.map(runtime => connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken }))
    connections.forEach(connection => onTestFinished(connection.dispose))
    const viewer = await openViewer(host)
    try {
      await Promise.all(connections.map(connection => connection.ready))
      expect(await viewer.$call('rstore:list-sessions', {})).toHaveLength(2)
      await viewer.$call('rstore:write-cache-item', { action: 'write-cache-item', target: targets[1], commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 'chosen', value: 42 } })
      expect(stores[1]!.read('items', 'chosen')).toMatchObject({ value: 42 })
      expect(stores[0]!.read('items', 'chosen')).toBeUndefined()
      const cache = await viewer.$call('rstore:get-cache', { target: targets[1], collection: 'items' })
      expect(cache.data.rows.map((row: any) => row.key)).toEqual(['chosen'])
      connections[1]!.dispose()
      await waitFor(async () => (await viewer.$call('rstore:list-sessions', {})).some((session: any) => session.sessionId === targets[1]!.sessionId && !session.connected))
      await expect(viewer.$call('rstore:get-collections', { target: targets[1] })).rejects.toMatchObject({ details: { code: 'UNAVAILABLE' } })
    }
    finally {
      viewer.$close()
      connections.forEach(connection => connection.dispose())
      runtimes.forEach(runtime => runtime.dispose())
      await host.close()
    }
  })

  it('denies viewer producer impersonation and incompatible protocol', async () => {
    const host = await startRelay()
    onTestFinished(host.close)
    const viewer = await openViewer(host)
    const producer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.nodeToken })
    try {
      expect(await viewer.$call('rstore:producer-register', { handshake: { protocolVersion: 1, sessionId: 'fake' }, session: { sessionId: 'fake', kind: 'node', label: 'fake', connected: true, completed: false, startedAt: Date.now(), stores: [] } })).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } })
      expect(await viewer.$call('rstore:list-sessions', {})).toEqual([])
      expect(await producer.rpc.$call('rstore:producer-register', { handshake: { protocolVersion: 0, sessionId: 'fake' }, session: { sessionId: 'fake', kind: 'node', label: 'fake', connected: true, completed: false, startedAt: Date.now(), stores: [] } })).toMatchObject({ ok: false, error: { code: 'PROTOCOL_MISMATCH' } })
    }
    finally {
      viewer.$close()
      producer.close()
      await host.close()
    }
  })
})
