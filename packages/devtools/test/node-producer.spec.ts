import type { DevframeNodeRpcSession } from 'devframe'
import type { SessionSummary } from '../src/protocol'
import { randomUUID } from 'node:crypto'
import { createCoreStack } from '#test-utils/store/coreStack'
import { defineModule } from '@rstore/core'
import { expect, it, onTestFinished } from 'vitest'
import { createProducerRegistry } from '../src/devframe/producer-registry'
import { connectRstoreDevtools } from '../src/node'
import { openRelayRpc } from '../src/node/rpc'
import { createRstoreDevtools } from '../src/runtime'
import { openViewer, startRelay, waitFor } from './utils/relay'

// Real native Node WebSocket + real relay protect producer reconnect authority.
// Duplicate socket must reject; reconnect must retain same target but new owner.
it('reclaims disconnected identity without granting concurrent duplicate authority', async () => {
  const host = await startRelay()
  onTestFinished(host.close)
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  const runtime = createRstoreDevtools({ kind: 'node' })
  onTestFinished(runtime.dispose)
  const target = runtime.attachStore(stack.store, { id: 'default' }).target
  const connections: ReturnType<typeof connectRstoreDevtools>[] = []
  const viewer = await openViewer(host)
  try {
    const first = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
    connections.push(first)
    onTestFinished(first.dispose)
    await first.ready
    const duplicate = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
    connections.push(duplicate)
    onTestFinished(duplicate.dispose)
    await expect(duplicate.ready).rejects.toThrow('already connected')
    duplicate.dispose()
    expect((await viewer.$call('rstore:list-sessions', {})).map((session: any) => session.sessionId)).toEqual([target.sessionId])
    first.dispose()
    await waitFor(async () => !(await viewer.$call('rstore:list-sessions', {}))[0]?.connected)
    const replacement = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
    connections.push(replacement)
    onTestFinished(replacement.dispose)
    await replacement.ready
    await viewer.$call('rstore:write-cache-item', { action: 'write-cache-item', target, commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 0, title: 'Reconnected' } })
    expect(stack.read('items', 0)).toMatchObject({ title: 'Reconnected' })
    const encoded = JSON.stringify(await viewer.$call('rstore:list-sessions', {}))
    expect(encoded).not.toContain(host.nodeToken)
    expect(encoded).not.toContain(host.viewerToken)
    await expect(openRelayRpc({ baseURL: host.baseURL, authToken: 'wrong-token' })).rejects.toThrow('authentication rejected')
    runtime.resolve(target).dispose()
    const fresh = runtime.attachStore(stack.store, { id: 'default' }).target
    expect(fresh.generation).toBeGreaterThan(target.generation)
    await expect(viewer.$call('rstore:delete-cache-item', { action: 'delete-cache-item', target, commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', key: 0 })).rejects.toMatchObject({ details: { code: 'STALE_TARGET' } })
    expect(stack.read('items', 0)).toMatchObject({ title: 'Reconnected' })
  }
  finally {
    connections.forEach(connection => connection.dispose())
    viewer.$close()
    runtime.dispose()
    await host.close()
  }
})

// Pure ownership algorithm receives session identities; no transport claim here.
it('fences stale disconnect and results after owner replacement', () => {
  const registry = createProducerRegistry()
  const summary: SessionSummary = { sessionId: 'process', kind: 'node', label: 'process', connected: true, completed: false, startedAt: 1, stores: [] }
  const oldSession = { meta: { id: 1 } } as DevframeNodeRpcSession
  const nextSession = { meta: { id: 2 } } as DevframeNodeRpcSession
  const oldOwner = registry.register(summary, oldSession)
  registry.disconnect(1)
  const nextOwner = registry.register(summary, nextSession)
  registry.disconnect(1)
  expect(registry.isCurrent('process', oldOwner)).toBe(false)
  expect(registry.isCurrent('process', nextOwner)).toBe(true)
  expect(registry.get('process').owner?.epoch).toBeGreaterThan(oldOwner.epoch)
  expect(registry.list()[0]?.connected).toBe(true)
  registry.dispose()
})

it('preserves completed SSR and disconnected producer kinds against identity claims', () => {
  const registry = createProducerRegistry('local')
  const session = { meta: { id: 1 } } as DevframeNodeRpcSession
  const ssr: SessionSummary = { sessionId: 'request', kind: 'ssr', label: 'request', connected: false, completed: true, startedAt: Date.now(), completedAt: Date.now(), stores: [] }
  registry.retain(ssr, () => 'recorded')
  expect(() => registry.register({ ...ssr, kind: 'node', completed: false, connected: true }, session)).toThrow('reserved or completed')
  expect(registry.get('request').read?.({ method: 'rstore:list-sessions' })).toBe('recorded')
  const node: SessionSummary = { sessionId: 'process', kind: 'node', label: 'process', connected: true, completed: false, startedAt: Date.now(), stores: [] }
  registry.register(node, session)
  registry.disconnect(1)
  expect(() => registry.register({ ...node, kind: 'browser' }, session)).toThrow('session kind')
  expect(registry.list().find(record => record.sessionId === 'process')?.kind).toBe('node')
  expect(() => registry.register({ ...node, sessionId: 'local' }, session)).toThrow('reserved')
  registry.dispose()
})

// Socket observer forwards original writes unchanged; only network disappears.
// Actual relay auth/register/Core paths remain real, including server restart.
it('reconnects when transport fails after authentication before registration completes', async () => {
  let registrationCut: () => void
  const cut = new Promise<void>((resolve) => {
    registrationCut = resolve
  })
  const upgradeURLs: string[] = []
  let cutOnce = false
  const firstHost = await startRelay({
    onUpgrade(request, socket) {
      upgradeURLs.push(request.url ?? '')
      if (cutOnce)
        return
      let authenticatedReplySent = false
      const originalWrite = socket.write.bind(socket)
      socket.write = ((chunk: any, ...args: any[]) => {
        if (String(chunk).includes('isTrusted'))
          authenticatedReplySent = true
        return (originalWrite as (...args: any[]) => boolean)(chunk, ...args)
      }) as typeof socket.write
      socket.on('data', () => {
        if (authenticatedReplySent && !cutOnce) {
          cutOnce = true
          socket.destroy()
          registrationCut!()
        }
      })
    },
  })
  onTestFinished(firstHost.close)
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  stack.cache.writeItem({ collection: stack.collection('items'), key: 0, item: { id: 0, title: 'Survives outage' } })
  const runtime = createRstoreDevtools()
  onTestFinished(runtime.dispose)
  const target = runtime.attachStore(stack.store, { id: 'default' }).target
  const connection = connectRstoreDevtools(runtime, { baseURL: firstHost.baseURL, authToken: firstHost.nodeToken })
  onTestFinished(connection.dispose)
  await Promise.race([cut, new Promise((_, reject) => setTimeout(() => reject(new Error('Registration outage was not observed')), 3000))])
  await firstHost.close()
  const replacementHost = await startRelay({ port: Number(new URL(firstHost.baseURL).port), nodeToken: firstHost.nodeToken })
  onTestFinished(replacementHost.close)
  await connection.ready
  const viewer = await openViewer(replacementHost)
  onTestFinished(() => viewer.$close())
  const reply = await viewer.$call('rstore:get-cache', { target, collection: 'items' })
  expect(reply.data.rows).toEqual([{ key: 0, value: { kind: 'object', entries: [['id', 0], ['title', 'Survives outage']] } }])
  expect(upgradeURLs).toHaveLength(1)
  expect(upgradeURLs[0]).not.toContain(firstHost.nodeToken)
  expect(upgradeURLs[0]).toBe('/nested/__rstore/__ws')
})

it('bounds concurrent watch admission and releases viewer quota on producer disconnect', async () => {
  const host = await startRelay()
  onTestFinished(host.close)
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  const runtime = createRstoreDevtools()
  onTestFinished(runtime.dispose)
  const target = runtime.attachStore(stack.store, { id: 'default' }).target
  const producer = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(producer.dispose)
  const viewer = await openViewer(host)
  onTestFinished(() => viewer.$close())
  await producer.ready
  const results = await Promise.allSettled(Array.from({ length: 101 }, () => viewer.$call('rstore:watch', { target, view: 'modules' })))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(100)
  const rejected = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[]
  expect(rejected).toHaveLength(1)
  expect(rejected[0]!.reason.message).toContain('capacity')
  producer.dispose()
  await waitFor(async () => !(await viewer.$call('rstore:list-sessions', {}))[0]?.connected)
  const replacement = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(replacement.dispose)
  await replacement.ready
  const renewed = await Promise.all(Array.from({ length: 100 }, () => viewer.$call('rstore:watch', { target, view: 'modules' })))
  expect(new Set(renewed.map(result => result.watchId)).size).toBe(100)
  await Promise.all(renewed.map(result => viewer.$call('rstore:unwatch', { watchId: result.watchId })))
})

it('detaches one runtime observations and quota while shared producer keeps another usable', async () => {
  const host = await startRelay()
  onTestFinished(host.close)
  const stacks = await Promise.all([1, 2].map(() => createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })))
  const runtimes = [createRstoreDevtools(), createRstoreDevtools()]
  runtimes.forEach(runtime => onTestFinished(runtime.dispose))
  const observing = [0, 0]
  const targets = runtimes.map((runtime, index) => runtime.attachStore(stacks[index]!.store, { id: 'default', adapter: {
    observe() {
      observing[index]!++
      return () => {
        observing[index]!--
      }
    },
  } }).target)
  stacks[1]!.cache.writeItem({ collection: stacks[1]!.collection('items'), key: 'kept', item: { id: 'kept', title: 'Second runtime survives' } })
  const producer = connectRstoreDevtools(runtimes[1]!, { baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(producer.dispose)
  const viewer = await openViewer(host)
  onTestFinished(() => viewer.$close())
  await producer.ready
  const detachFirst = producer.attach(runtimes[0]!)
  onTestFinished(detachFirst)
  await waitFor(async () => (await viewer.$call('rstore:list-sessions', {})).filter((session: any) => session.connected).length === 2)
  await Promise.all(Array.from({ length: 99 }, () => viewer.$call('rstore:watch', { target: targets[0], view: 'modules' })))
  const secondWatch = await viewer.$call('rstore:watch', { target: targets[1], view: 'modules' })
  expect(observing).toEqual([1, 1])
  detachFirst()
  expect(observing).toEqual([0, 1])
  await waitFor(async () => (await viewer.$call('rstore:list-sessions', {})).some((session: any) => session.sessionId === targets[0]!.sessionId && !session.connected))
  const read = await viewer.$call('rstore:get-cache', { target: targets[1], collection: 'items' })
  expect(read.data.rows).toEqual([{ key: 'kept', value: { kind: 'object', entries: [['id', 'kept'], ['title', 'Second runtime survives']] } }])
  const renewed = await Promise.all(Array.from({ length: 99 }, () => viewer.$call('rstore:watch', { target: targets[1], view: 'modules' })))
  await Promise.all([...renewed, secondWatch].map(result => viewer.$call('rstore:unwatch', { watchId: result.watchId })))
  expect(observing).toEqual([0, 0])
})

it('observes remote Core module changes only while viewer retains active view', async () => {
  const host = await startRelay()
  onTestFinished(host.close)
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  const counter = await defineModule(stack.store, 'counter', ({ defineState }) => ({ counter: defineState({ value: 0 }) }))()
  const runtime = createRstoreDevtools({ kind: 'node' })
  onTestFinished(runtime.dispose)
  const target = runtime.attachStore(stack.store, { id: 'default' }).target
  const producer = connectRstoreDevtools(runtime, { baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(producer.dispose)
  let invalidations = 0
  const viewer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.viewerToken }, { 'rstore:invalidate': (event: any) => {
    if (event.view === 'modules')
      invalidations++
  } })
  try {
    await producer.ready
    const { watchId } = await viewer.rpc.$call('rstore:watch', { target, view: 'modules' })
    counter.counter.value = 7
    await waitFor(async () => invalidations === 1).catch((error) => {
      throw new Error(`Modules observation: ${invalidations} viewer events, ${runtime.resolve(target).revisions.modules} runtime revisions`, { cause: error })
    })
    const reply = await viewer.rpc.$call('rstore:get-modules', { target })
    expect(reply.data).toMatchObject([{ name: 'counter', value: { kind: 'object', entries: expect.arrayContaining([['counter', { kind: 'object', entries: [['value', 7]] }]]) } }])
    await viewer.rpc.$call('rstore:unwatch', { watchId })
    counter.counter.value = 8
    await new Promise(resolve => setTimeout(resolve, 350))
    expect(invalidations).toBe(1)
  }
  finally {
    viewer.close()
    producer.dispose()
    runtime.dispose()
    await host.close()
  }
})
