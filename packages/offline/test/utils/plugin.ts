import type { OfflinePluginRuntime } from '../../src/plugin/types'
import { vi } from 'vitest'

/**
 * In-memory stand-in for the api returned by `useIndexedDb`.
 *
 * Every method is a spy so tests can assert on calls, and the backing `stores`
 * map lets them assert on the resulting state instead.
 */
export interface FakeOfflineDb {
  /** Store name to its key/value contents. */
  stores: Map<string, Map<string, any>>
  /** Read one stored row at the allowed DB boundary. */
  readItem: ReturnType<typeof vi.fn>
  /** Persist exact received row so writes can be asserted independently. */
  writeItem: ReturnType<typeof vi.fn>
  /** Delete only addressed row in simulated DB persistence. */
  deleteItem: ReturnType<typeof vi.fn>
}

/** Creates an in-memory fake of the IndexedDB helper. */
export function createFakeDb(): FakeOfflineDb {
  const stores = new Map<string, Map<string, any>>()

  /** Acquire simulated DB table for the allowed persistence boundary. */
  function getStore(storeName: string) {
    let store = stores.get(storeName)
    if (!store) {
      store = new Map()
      stores.set(storeName, store)
    }
    return store
  }

  return {
    stores,
    readItem: vi.fn(async (storeName: string, key: string) => getStore(storeName).get(key)),
    writeItem: vi.fn(async (storeName: string, key: string, value: any) => {
      getStore(storeName).set(key, value)
    }),
    deleteItem: vi.fn(async (storeName: string, key: string) => {
      getStore(storeName).delete(key)
    }),

  }
}

/**
 * Creates an offline plugin runtime backed by a fake IndexedDB, plus the fake
 * itself so tests can seed and inspect it.
 */
export function createRuntime(overrides: Partial<OfflinePluginRuntime> = {}): {
  runtime: OfflinePluginRuntime
  db: FakeOfflineDb
} {
  const db = createFakeDb()
  const runtime: OfflinePluginRuntime = {
    options: {},
    opsStoreName: 'rstore-offline-ops-queue',
    globalMetadataKey: 'rstore-offline-global-metadata',
    globalMetadata: null,
    db: db as unknown as OfflinePluginRuntime['db'],
    ...overrides,
  }
  return { runtime, db }
}
