import { MessageChannel } from 'node:worker_threads'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createCoreStore } from '#test-utils/store/realCacheStore'
import { describe, expect, it, vi } from 'vitest'
import { createBrowserChannel } from '../src/browser/channel'
import { connectBrowserPanel } from '../src/browser/panel'
import { createRstoreDevtools } from '../src/runtime'

/** Actual MessagePorts and real stores prove DTO dispatch; browser handshake has separate Playwright coverage. */
describe('devframe in-page DTO dispatch', () => {
  it('rejects wildcard and path-based origins instead of widening viewer trust', () => {
    const runtime = createRstoreDevtools()
    try {
      for (const origin of ['*', 'null', 'https://example.com/path'])
        expect(() => createBrowserChannel(runtime, { window: false, allowedOrigins: [origin] })).toThrow('exact HTTP origins')
    }
    finally { runtime.dispose() }
  })

  it('closing panel rejects held backend command without replay; another panel remains usable', async () => {
    const fixture = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], tombstoneGc: false })
    const releaseBackend = fixture.remote.holdNext('createItem')
    const runtime = createRstoreDevtools({ kind: 'browser' })
    const target = runtime.attachStore(fixture.store, { id: 'store' }).target
    const producer = createBrowserChannel(runtime, { window: false })
    const ports = [new MessageChannel(), new MessageChannel()]
    const panels = ports.map((port) => {
      producer.addPanelPort(port.port1 as unknown as MessagePort)
      return connectBrowserPanel({ window: false, transport: port.port2 as unknown as MessagePort })
    })
    let command: Promise<unknown> | undefined
    try {
      await Promise.all(panels.map(panel => panel.whenConnected()))
      command = panels[0]!.execute({ target, action: 'create-item', commandId: 'held', issuedAt: Date.now(), collection: 'todos', item: { id: 'created', title: 'held' } }).catch(error => error)
      await vi.waitFor(() => expect(fixture.remote.callCount('createItem')).toBe(1))
      expect(fixture.remote.rows('todos')).toEqual([])
      panels[0]!.dispose()
      await expect(command).resolves.toMatchObject({ details: { code: 'UNKNOWN_OUTCOME', outcome: 'unknown' } })
      expect((await panels[1]!.read({ method: 'rstore:get-collections', target }) as any).target).toEqual(target)
      releaseBackend()
      await vi.waitFor(() => expect(fixture.remote.rows('todos')).toEqual([{ id: 'created', title: 'held' }]))
      expect(fixture.remote.callCount('createItem')).toBe(1)
    }
    finally {
      releaseBackend()
      for (const panel of panels) panel.dispose()
      producer.close()
      runtime.dispose()
      fixture.dispose()
      for (const port of ports) {
        port.port1.close()
        port.port2.close()
      }
      await command
    }
  })

  it('reads and mutates exact Core target, rejects malformed writes, and preserves other store', async () => {
    const first = await createCoreStore({ factory: 'core', schema: [{ name: 'todos' }], tombstoneGc: false })
    const other = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    const runtime = createRstoreDevtools({ kind: 'browser' })
    const target = runtime.attachStore(first.store, { id: 'first' }).target
    runtime.attachStore(other.store, { id: 'other' })
    const producer = createBrowserChannel(runtime, { window: false })
    const ports = new MessageChannel()
    producer.addPanelPort(ports.port1 as unknown as MessagePort)
    const panel = connectBrowserPanel({ window: false, transport: ports.port2 as unknown as MessagePort })
    try {
      await panel.whenConnected()
      const sessions = await panel.read({ method: 'rstore:list-sessions' }) as any[]
      expect(sessions[0].stores.map((store: any) => store.target.storeId)).toEqual(['first', 'other'])
      const action = { action: 'write-cache-item' as const, target, commandId: 'write-1', issuedAt: Date.now(), collection: 'todos', item: { id: 0, title: 'owned' } }
      expect((await panel.execute(action)).status).toBe('completed')
      const reply = await panel.read({ method: 'rstore:get-cache', target, collection: 'todos' }) as any
      expect(reply.data.rows).toEqual([{ key: 0, value: { kind: 'object', entries: [['id', 0], ['title', 'owned']] } }])
      expect(other.cache.readItems({ collection: other.store.$collections[0] })).toEqual([])
      await expect(panel.execute({ ...action, commandId: 'bad', item: { id: 'bad', title: 'x'.repeat(40000) } })).rejects.toMatchObject({ details: { code: 'INVALID_ARGUMENTS' } })
      expect(first.cache.readItems({ collection: first.store.$collections[0] })).toEqual([{ id: 0, title: 'owned' }])
    }
    finally {
      panel.dispose()
      producer.close()
      runtime.dispose()
      first.dispose()
      other.dispose()
      ports.port1.close()
      ports.port2.close()
    }
  })

  it('disposing one panel preserves another and replacement generation rejects old authority', async () => {
    const fixture = await createCoreStore({ factory: 'core', schema: [{ name: 'todos' }], tombstoneGc: false })
    const runtime = createRstoreDevtools({ kind: 'browser' })
    const registration = runtime.attachStore(fixture.store, { id: 'same' })
    const producer = createBrowserChannel(runtime, { window: false })
    const ports = [new MessageChannel(), new MessageChannel()]
    const panels = ports.map((port) => {
      producer.addPanelPort(port.port1 as unknown as MessagePort)
      return connectBrowserPanel({ window: false, transport: port.port2 as unknown as MessagePort })
    })
    const registryEvents: unknown[] = []
    panels[1]!.subscribe((event) => {
      if (event.view === 'registry')
        registryEvents.push(event)
    })
    try {
      await Promise.all(panels.map(panel => panel.whenConnected()))
      panels[0].dispose()
      expect((await panels[1].read({ method: 'rstore:list-sessions' }) as any[])[0].stores).toHaveLength(1)
      registration.dispose()
      const replacement = runtime.attachStore(fixture.store, { id: 'same' })
      await vi.waitFor(() => expect(registryEvents).toEqual([
        { view: 'registry', revision: 2 },
        { view: 'registry', revision: 3 },
      ]))
      expect(replacement.target.generation).toBeGreaterThan(registration.target.generation)
      await expect(panels[1].read({ method: 'rstore:get-collections', target: registration.target })).rejects.toMatchObject({ details: { code: 'STALE_TARGET' } })
      expect((await panels[1].read({ method: 'rstore:get-collections', target: replacement.target }) as any).target).toEqual(replacement.target)
    }
    finally {
      for (const panel of panels) panel.dispose()
      producer.close()
      runtime.dispose()
      fixture.dispose()
      for (const port of ports) {
        port.port1.close()
        port.port2.close()
      }
    }
  })
})
