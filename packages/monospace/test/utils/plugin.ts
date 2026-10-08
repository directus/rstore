import { vi } from 'vitest'

/**
 * Mocked Monospace REST client shape used by plugin tests.
 */
export interface MockMonospaceClient {
  /** External REST createMany operation. */
  createMany: ReturnType<typeof vi.fn>
  /** External REST createOne operation. */
  createOne: ReturnType<typeof vi.fn>
  /** External REST deleteMany operation. */
  deleteMany: ReturnType<typeof vi.fn>
  /** External REST deleteOne operation. */
  deleteOne: ReturnType<typeof vi.fn>
  /** External REST readMany operation. */
  readMany: ReturnType<typeof vi.fn>
  /** External REST readOne operation. */
  readOne: ReturnType<typeof vi.fn>
  /** External REST updateMany operation. */
  updateMany: ReturnType<typeof vi.fn>
  /** External REST updateOne operation. */
  updateOne: ReturnType<typeof vi.fn>
}

/**
 * Creates a mocked Monospace REST client.
 */
export function createMockClient(): MockMonospaceClient {
  return {
    createMany: vi.fn(),
    createOne: vi.fn(),
    deleteMany: vi.fn(),
    deleteOne: vi.fn(),
    readMany: vi.fn(),
    readOne: vi.fn(),
    updateMany: vi.fn(),
    updateOne: vi.fn(),
  }
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
      monospace: {
        collection: 'Todos',
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
      monospace: {
        collection: 'Profiles',
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
 * Creates a resolved Orders collection with a composite primary key.
 */
export function createOrdersCollection(): any {
  return {
    name: 'Orders',
    meta: {
      primaryKeys: ['shop_id', 'code'],
      monospace: {
        collection: 'Orders',
      },
    },
    getKey: (item: any) => item.shop_id != null && item.code != null ? `${item.shop_id}::${item.code}` : undefined,
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
      monospace: {
        collection: 'OrderItems',
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
 * Creates a form operation entry as recorded by rstore form objects.
 */
export function createFormOp(field: string, type: 'set' | 'connect' | 'disconnect', newValue: any, oldValue?: any): any {
  return { timestamp: Date.now(), field, type, newValue, oldValue }
}

/**
 * Adds generated connect key metadata for a relation on a test collection.
 */
export function withConnectKeys(collection: any, relationKey: string, connectKeys: string[]): any {
  collection.meta.monospace.relations = {
    ...collection.meta.monospace.relations,
    [relationKey]: { connectKeys },
  }
  return collection
}
