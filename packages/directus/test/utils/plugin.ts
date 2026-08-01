import type { PluginSetupApi } from '@rstore/shared'
import { vi } from 'vitest'
import { createDirectusRstorePlugin } from '../../src'

/**
 * Mocked Directus SDK client shape used by plugin tests.
 */
export interface MockDirectusClient {
  request: ReturnType<typeof vi.fn>
}

/**
 * Creates a mocked Directus SDK client.
 */
export function createMockDirectusClient(): MockDirectusClient {
  return {
    request: vi.fn(),
  }
}

/**
 * Creates a test plugin and captures registered rstore hooks.
 */
export function setupPlugin(client: MockDirectusClient): Record<string, any> {
  const hooks: Record<string, any> = {}
  const plugin = createDirectusRstorePlugin({
    client: client as any,
    scopeId: 'test-scope',
  })
  plugin.setup({
    addCollectionDefaults: vi.fn(),
    hook: vi.fn((name, callback) => {
      hooks[name] = callback
      return vi.fn()
    }),
  } as unknown as PluginSetupApi)
  return hooks
}

/**
 * Runs a data hook and returns the value passed to `setResult`.
 */
export async function runHook(callback: any, payload: Record<string, any>): Promise<unknown> {
  let result: unknown
  await callback({
    abort: vi.fn(),
    findOptions: {},
    getResult: () => result,
    setResult: (value: unknown) => {
      result = value
    },
    ...payload,
  })
  return result
}

/**
 * Creates the resolved Todos collection shape used by runtime plugin tests.
 *
 * The `author` relation joins on the real `author_id` FK column referencing
 * the Profiles primary key.
 */
export function createTodosCollection(): any {
  return {
    name: 'Todos',
    meta: {
      primaryKeys: ['id'],
      directus: {
        collection: 'Todos',
        singleton: false,
      },
    },
    getKey: (item: any) => item.id,
    normalizedRelations: {
      author: {
        many: false,
        to: [{
          collection: 'Profiles',
          on: { id: 'author_id' },
        }],
      },
    },
  }
}

/**
 * Creates the resolved Profiles collection shape used by relation tests.
 *
 * The backward `todos` relation joins on the real `author_id` FK column
 * carried by the Todos items.
 */
export function createProfilesCollection(): any {
  return {
    name: 'Profiles',
    meta: {
      primaryKeys: ['id'],
      directus: {
        collection: 'Profiles',
        singleton: false,
      },
    },
    getKey: (item: any) => item.id,
    normalizedRelations: {
      todos: {
        many: true,
        to: [{
          collection: 'Todos',
          on: { author_id: 'id' },
        }],
      },
    },
  }
}

/**
 * Creates a resolved singleton Settings collection.
 */
export function createSettingsCollection(): any {
  return {
    name: 'Settings',
    meta: {
      primaryKeys: ['id'],
      directus: {
        collection: 'Settings',
        singleton: true,
      },
    },
    getKey: () => 'singleton',
    normalizedRelations: {},
  }
}

/**
 * Creates a resolved Orders collection with a composite primary key and a
 * composite-join `items` relation.
 */
export function createOrdersCollection(): any {
  return {
    name: 'Orders',
    meta: {
      primaryKeys: ['shop_id', 'code'],
      directus: {
        collection: 'Orders',
        singleton: false,
      },
    },
    getKey: (item: any) => item.shop_id != null && item.code != null ? `${item.shop_id}:${item.code}` : undefined,
    normalizedRelations: {
      items: {
        many: true,
        to: [{
          collection: 'OrderItems',
          on: { order_shop_id: 'shop_id', order_code: 'code' },
        }],
      },
    },
  }
}

/**
 * Creates a resolved OrderItems collection related to composite-key Orders
 * through the real composite FK columns.
 */
export function createOrderItemsCollection(): any {
  return {
    name: 'OrderItems',
    meta: {
      primaryKeys: ['id'],
      directus: {
        collection: 'OrderItems',
        singleton: false,
      },
    },
    getKey: (item: any) => item.id,
    normalizedRelations: {
      order: {
        many: false,
        to: [{
          collection: 'Orders',
          on: { shop_id: 'order_shop_id', code: 'order_code' },
        }],
      },
    },
  }
}

/**
 * Options accepted by {@link createRelationStore}.
 */
export interface CreateRelationStoreOptions {
  /**
   * Resolved collections registered in the store.
   */
  collections?: any[]

  /**
   * Cache contents keyed by collection name.
   */
  cacheItems?: Record<string, any[]>
}

/**
 * Creates a minimal store shape whose per-collection `findMany` mocks are
 * memoized by collection name so tests can assert batched relation fetches.
 */
export function createRelationStore(options: CreateRelationStoreOptions = {}): any {
  const collections = options.collections ?? [createTodosCollection(), createProfilesCollection()]
  const cacheItems = options.cacheItems ?? {}
  const collectionApis = new Map<string, { findMany: ReturnType<typeof vi.fn> }>()
  return {
    $collections: collections,
    $collection: vi.fn((name: string) => {
      if (!collectionApis.has(name)) {
        collectionApis.set(name, { findMany: vi.fn(async () => []) })
      }
      return collectionApis.get(name)!
    }),
    $cache: {
      readItems: vi.fn(({ collection, filter }: any) => {
        const items = cacheItems[collection.name] ?? []
        return filter ? items.filter(filter) : items
      }),
    },
  }
}
