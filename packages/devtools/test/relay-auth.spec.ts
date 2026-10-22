import type { RuntimeInvalidation } from '../src/runtime/types'
import { randomUUID } from 'node:crypto'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { expect, it, onTestFinished } from 'vitest'
import { openRelayRpc } from '../src/node/rpc'
import { createRstoreDevtools } from '../src/runtime'
import { captureSSRSnapshot } from '../src/ssr/snapshot'
import { startRelay, waitFor } from './utils/relay'

// Boundary: real runtime/Core/cache and pinned Devframe WS/auth transport. An
// untrusted socket must receive no metadata while an authenticated viewer gets
// local cache, producer and completed SSR invalidations. A rejected RPC after
// each publication is a wire-order barrier, so denial assertions need no sleep.
it('delivers invalidations only to authenticated relay peers', async () => {
  const runtime = createRstoreDevtools({ kind: 'node' })
  onTestFinished(runtime.dispose)
  const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'items' }] })
  const target = runtime.attachStore(stack.store, { id: 'private-store' }).target
  const host = await startRelay({ runtime })
  onTestFinished(host.close)
  const deniedEvents: unknown[] = []
  const channel = createWsRpcChannel({ url: new URL('__ws', host.baseURL).href.replace(/^http/, 'ws') })
  onTestFinished(() => channel.close())
  const denied = createRpcClient({ 'rstore:invalidate': (event: unknown) => deniedEvents.push(event) }, { channel, rpcOptions: { timeout: 1000 } })
  onTestFinished(() => denied.$close())
  const allowedEvents: RuntimeInvalidation[] = []
  const viewer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.viewerToken }, { 'rstore:invalidate': (event: RuntimeInvalidation) => allowedEvents.push(event) })
  onTestFinished(viewer.close)
  await expect(denied.$call('rstore:list-sessions', {})).rejects.toThrow('not authorized')

  await runtime.execute({ action: 'write-cache-item', target, commandId: randomUUID(), issuedAt: Date.now(), collection: 'items', item: { id: 'visible', value: 42 } })
  await waitFor(async () => allowedEvents.some(event => event.view === 'cache' && event.target?.storeId === 'private-store'))
  expect(stack.read('items', 'visible')).toMatchObject({ value: 42 })
  await expect(denied.$call('rstore:list-sessions', {})).rejects.toThrow('not authorized')

  const producerRuntime = createRstoreDevtools({ kind: 'node' })
  onTestFinished(producerRuntime.dispose)
  const producerTarget = producerRuntime.attachStore(stack.store, { id: 'remote-store' }).target
  const producer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.nodeToken })
  onTestFinished(producer.close)
  const publication = { handshake: { protocolVersion: 1, sessionId: producerRuntime.session.sessionId }, session: producerRuntime.session }
  await producer.rpc.$call('rstore:producer-register', publication)
  await producer.rpc.$call('rstore:producer-publish', publication, { view: 'history', target: producerTarget, revision: 17 })
  await waitFor(async () => allowedEvents.some(event => event.view === 'history' && event.revision === 17))
  await expect(denied.$call('rstore:list-sessions', {})).rejects.toThrow('not authorized')

  const ssrRuntime = createRstoreDevtools({ kind: 'ssr' })
  onTestFinished(ssrRuntime.dispose)
  const ssr = await openRelayRpc({ baseURL: host.baseURL, authToken: host.ssrToken })
  onTestFinished(ssr.close)
  const record = captureSSRSnapshot(ssrRuntime, { path: '/private-request', method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'completed' })
  const beforeSSR = allowedEvents.length
  await ssr.rpc.$call('rstore:producer-ssr-snapshot', record)
  await waitFor(async () => allowedEvents.length > beforeSSR)
  expect(allowedEvents.slice(beforeSSR)).toEqual([expect.objectContaining({ view: 'registry' })])
  await expect(denied.$call('rstore:list-sessions', {})).rejects.toThrow('not authorized')
  expect(deniedEvents).toEqual([])
})

// Legitimate two-store captures are valid. A producer may not add an invented
// target, duplicate authority, or put primary-store replies under another store.
it('rejects additional SSR sections without exact advertised authority', async () => {
  const runtime = createRstoreDevtools({ kind: 'ssr' })
  onTestFinished(runtime.dispose)
  const stores = await Promise.all([1, 2].map(() => createCoreStack({ factory: 'core', isServer: true, schema: [{ name: 'items' }] })))
  stores.forEach((stack, index) => runtime.attachStore(stack.store, { id: `store-${index}` }))
  const record = captureSSRSnapshot(runtime, { path: '/two-stores', method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now(), status: 'completed' })
  const host = await startRelay()
  onTestFinished(host.close)
  const producer = await openRelayRpc({ baseURL: host.baseURL, authToken: host.ssrToken })
  onTestFinished(producer.close)
  const duplicate = structuredClone(record)
  duplicate.additionalStores!.push(structuredClone(record.additionalStores![0]!))
  const unadvertised = structuredClone(record)
  unadvertised.additionalStores![0]!.target.storeId = 'invented-store'
  const foreignReply = structuredClone(record)
  foreignReply.additionalStores![0]!.views.history!.target = { ...record.target }
  for (const input of [duplicate, unadvertised, foreignReply])
    await expect(producer.rpc.$call('rstore:producer-ssr-snapshot', input)).rejects.toThrow('SSR capture')
  expect(await producer.rpc.$call('rstore:list-sessions', {})).toEqual([])
  await producer.rpc.$call('rstore:producer-ssr-snapshot', record)
  const reply = await producer.rpc.$call('rstore:get-collections', { target: record.additionalStores![0]!.target })
  expect(reply.target).toEqual(record.additionalStores![0]!.target)
  expect(reply.data.map((collection: { name: string }) => collection.name)).toEqual(['items'])
})
