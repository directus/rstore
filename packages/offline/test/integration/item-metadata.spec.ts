import type { FakeRemote } from '#test-utils/store/fakeRemote'
import type { Plugin } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { stubWindow } from '#test-utils/store/windowStub'
import { createMultiplayerPlugin, getFieldTimestamps, getTombstone } from '@rstore/multiplayer'
import { stringifyHLC } from '@rstore/multiplayer/clock'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOfflinePlugin } from '../../src'
import { useIndexedDb } from '../../src/indexeddb'
import { itemMetadataStoreName } from '../../src/plugin/constants'

// Field stamps and tombstones are `persist` item metadata namespaces of
// `createMultiplayerPlugin()`. The offline plugin mirrors them to IndexedDB and
// restores them on the next sync, so a reload does not reset LWW: a stale
// realtime frame received after the reload still loses.

/** HLC string at `physical` ms. */
function hlc(physical: number) {
  return stringifyHLC({ physical, logical: 0, nodeId: 'server' })
}

let dbName: string
let network: { onLine: boolean }

beforeEach(() => {
  const factory = new IDBFactory()
  const { window } = stubWindow()
  vi.stubGlobal('localStorage', window.localStorage)
  vi.stubGlobal('indexedDB', factory)
  network = { onLine: true }
  vi.stubGlobal('navigator', network)
  dbName = `offline-metadata-${crypto.randomUUID()}`
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** One "page load": a store with offline persistence and multiplayer LWW on a shared backend. */
async function load(remote?: FakeRemote, plugins: Plugin[] = []) {
  const stack = await createVueStack({
    schema: [{ name: 'todos' }],
    remote: remote ?? { data: { todos: [{ id: 1, title: 'server' }, { id: 2, title: 'two' }] } },
    plugins: [
      createOfflinePlugin({ dbName, reconnect: false }),
      createMultiplayerPlugin({ tombstoneGc: false }),
      ...plugins,
    ],
  })
  await stack.store.$sync()
  return stack
}

/** Wait until IndexedDB holds `count` persisted item metadata entries. */
async function waitForPersistedEntries(count: number) {
  const db = await useIndexedDb(dbName)
  try {
    await vi.waitFor(async () => expect(await db.readAllItems(itemMetadataStoreName)).toHaveLength(count))
  }
  finally {
    db.dispose()
  }
}

describe('offline item metadata persistence', () => {
  it('restores field stamps and tombstones after a reload', async () => {
    const first = await load()
    await first.store.todos.update({ id: 1, title: 'mine' }, { metadata: { fieldTimestamps: { title: hlc(2000) } } })
    first.cache.deleteItem({ collection: first.collection('todos'), key: 2, metadata: { deletedAt: hlc(3000) } })
    await waitForPersistedEntries(2)
    first.dispose()

    const second = await load(first.remote)

    expect(getFieldTimestamps(second.store, 'todos', 1)).toEqual({ title: hlc(2000) })
    expect(getTombstone(second.store, 'todos', 2)?.deletedAt).toBe(hlc(3000))
  })

  it('keeps the persisted stamp winning over a stale realtime frame after a reload', async () => {
    const first = await load()
    await first.store.todos.update({ id: 1, title: 'mine' }, { metadata: { fieldTimestamps: { title: hlc(2000) } } })
    await waitForPersistedEntries(1)
    first.dispose()

    const second = await load(first.remote)
    second.cache.writeItem({ collection: second.collection('todos'), key: 1, item: { id: 1, title: 'stale' }, metadata: { fieldTimestamps: { title: hlc(1000) } } })

    expect(second.read('todos', 1)?.title).toBe('mine')
  })

  it('forgets the stamps of a row deleted without a tombstone', async () => {
    const first = await load()
    await first.store.todos.update({ id: 1, title: 'mine' }, { metadata: { fieldTimestamps: { title: hlc(2000) } } })
    await waitForPersistedEntries(1)
    await first.store.todos.delete(1)
    await waitForPersistedEntries(0)
  })
})

describe('offline queued operations', () => {
  it('replays a queued update with its original metadata', async () => {
    const first = await load()
    network.onLine = false
    await first.store.todos.update({ id: 1, title: 'offline' }, { metadata: { fieldTimestamps: { title: hlc(5000) } } })
    first.dispose()

    network.onLine = true
    const written: unknown[] = []
    const second = await load(first.remote, [{
      name: 'observe-writes',
      setup: ({ hook }) => {
        hook('cacheBeforeWriteItem', ({ key, metadata }) => {
          if (key === 1 && metadata)
            written.push(metadata)
        })
      },
    }])

    expect(second.remote.rows('todos').find(row => row.id === 1)?.title).toBe('offline')
    expect(written).toContainEqual({ fieldTimestamps: { title: hlc(5000) } })
  })
})
