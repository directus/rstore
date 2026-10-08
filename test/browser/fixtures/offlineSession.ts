import type { CreateOfflinePluginOptions } from '../../../packages/offline/src'
import type { QueuedOp } from '../../../packages/offline/src/storage'
import { createItem, createMany, deleteItem, updateItem } from '@rstore/core'
import { createOfflinePlugin } from '../../../packages/offline/src'
import { useIndexedDb } from '../../../packages/offline/src/indexeddb'
import { disposeReconnectListener } from '../../../packages/offline/src/plugin/reconnect'
import { createFakeRemote } from '../../utils/store/fakeRemote'
import { createCoreStore } from '../../utils/store/realCacheStore'

/** One browser-owned store using native persistence and simulated remote service. */
export type OfflineSession = Awaited<ReturnType<typeof createSession>>
let current: OfflineSession | undefined

/** Create and install the actual offline plugin without an automatic initial sync. */
export async function createSession(options: CreateOfflinePluginOptions = {}, data: any[] = [], collectionNames = ['Todos']) {
  const dbName = options.dbName ?? `browser-offline-${crypto.randomUUID()}`
  const remote = createFakeRemote({ data: { Todos: data } })
  const stack = await createCoreStore({
    schema: collectionNames.map(name => ({ name })),
    plugins: [remote.plugin, createOfflinePlugin({ reconnect: false, ...options, dbName })],
    syncImmediately: false,
    tombstoneGc: false,
  })
  const db = await useIndexedDb(dbName)
  const collection = stack.store.$collections[0]!
  return { ...stack, db, remote, dbName, collection }
}

/** Initialize the session retained across browser actions, including offline transitions. */
export async function initialize(options: CreateOfflinePluginOptions = {}, collectionNames = ['Todos']) {
  current = await createSession(options, [
    { id: '1', text: 'original' },
    { id: '2', text: 'second' },
    { id: '3', text: 'survivor' },
  ], collectionNames)
}

/** Read the initialized browser session. */
export function getSession() {
  if (!current)
    throw new Error('Offline browser session has not been initialized')
  return current
}

/** Seed supported persistent queue records, representing operations saved before reload. */
export async function queue(operation: Partial<QueuedOp> = {}) {
  const session = getSession()
  const op = {
    id: 'op-1',
    type: 'update',
    collectionName: 'Todos',
    key: '1',
    item: { id: '1', text: 'updated' },
    time: new Date(0),
    ...operation,
  } as QueuedOp
  await session.db.writeItem('rstore-offline-ops-queue', op.id, op)
}

/** Snapshot public cache, persisted mirror, queue and remote effects independently. */
export async function snapshot() {
  const session = getSession()
  return {
    online: navigator.onLine,
    remote: session.remote.rows('Todos'),
    cache: session.cache.readItems({ collection: session.collection }).map(item => ({ ...item })),
    mirror: await session.db.readAllItems('Todos'),
    queue: (await session.db.readAllItems('rstore-offline-ops-queue')).map(op => ({ ...op, time: op.time.toISOString() })),
    requests: session.remote.requests(),
    error: session.store.$syncState.error?.message,
  }
}

/** Run public mutation API using real cache and installed plugin. */
export async function mutate(options: { type: 'create' | 'createMany' | 'update' | 'delete', item?: any, items?: any[], key?: string, skipCache?: boolean }) {
  const session = getSession()
  const base = { store: session.store, collection: session.collection, skipCache: options.skipCache }
  if (options.type === 'create')
    await createItem({ ...base, item: options.item })
  else if (options.type === 'createMany')
    await createMany({ ...base, items: options.items! })
  else if (options.type === 'update')
    await updateItem({ ...base, key: options.key!, item: options.item })
  else
    await deleteItem({ ...base, key: options.key! })
  return snapshot()
}

/** Sync through public store API and return observable final state. */
export async function sync() {
  await getSession().store.$sync()
  return snapshot()
}

/** Release observer handle and real cache; browser context teardown releases plugin DB leases. */
export function dispose() {
  current?.db.dispose()
  current?.dispose()
  current = undefined
  disposeReconnectListener()
}
