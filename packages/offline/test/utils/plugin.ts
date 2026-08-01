import type { OfflinePluginRuntime } from '../../src/plugin/types'
import { vi } from 'vitest'

/**
 * Captures the hooks an installer registers so tests can invoke them directly,
 * without booting a real store.
 */
export interface HookCollector {
  /** Stand-in for the plugin `hook()` api passed to the installers. */
  hook: (name: string, callback: (payload: any) => any) => void
  /** Invokes every handler registered under `name`, awaiting each one. */
  run: (name: string, payload: Record<string, any>) => Promise<void>
}

/**
 * Creates a hook collector.
 *
 * Handlers are kept in a list per name because several installers may register
 * under the same hook (`init` is claimed by both sync and reconnect).
 */
export function createHookCollector(): HookCollector {
  const handlers = new Map<string, Array<(payload: any) => any>>()

  return {
    hook: (name, callback) => {
      const existing = handlers.get(name)
      if (existing) {
        existing.push(callback)
      }
      else {
        handlers.set(name, [callback])
      }
    },
    run: async (name, payload) => {
      for (const handler of handlers.get(name) ?? []) {
        await handler(payload)
      }
    },
  }
}

/**
 * In-memory stand-in for the api returned by `useIndexedDb`.
 *
 * Every method is a spy so tests can assert on calls, and the backing `stores`
 * map lets them assert on the resulting state instead.
 */
export interface FakeOfflineDb {
  /** Store name to its key/value contents. */
  stores: Map<string, Map<string, any>>
  readAllItems: ReturnType<typeof vi.fn>
  readItem: ReturnType<typeof vi.fn>
  writeItem: ReturnType<typeof vi.fn>
  deleteItem: ReturnType<typeof vi.fn>
  clearDatabase: ReturnType<typeof vi.fn>
}

/** Creates an in-memory fake of the IndexedDB helper. */
export function createFakeDb(): FakeOfflineDb {
  const stores = new Map<string, Map<string, any>>()

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
    readAllItems: vi.fn(async (storeName: string) => [...getStore(storeName).values()]),
    readItem: vi.fn(async (storeName: string, key: string) => getStore(storeName).get(key)),
    writeItem: vi.fn(async (storeName: string, key: string, value: any) => {
      getStore(storeName).set(key, value)
    }),
    deleteItem: vi.fn(async (storeName: string, key: string) => {
      getStore(storeName).delete(key)
    }),
    clearDatabase: vi.fn(async (storeName: string) => {
      getStore(storeName).clear()
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

/**
 * Creates a minimal resolved collection, keyed on `id` unless a custom `getKey`
 * is provided.
 */
export function createCollection(name = 'Todos', getKey: (item: any) => any = item => item?.id): any {
  return {
    name,
    getKey: vi.fn(getKey),
  }
}
