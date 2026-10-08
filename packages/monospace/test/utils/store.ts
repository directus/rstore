import {
  createItem,
  createMany,
  defaultMarker,
  deleteItem,
  deleteMany,
  findFirst,
  findMany,
  getMarker,
  updateItem,
  updateMany,
} from '@rstore/core'
import { createStore } from '@rstore/vue'
import { createMonospaceRstorePlugin } from '../../src'
import {
  createMockClient,
  createOrderItemsCollection,
  createOrdersCollection,
  createProfilesCollection,
  createTodosCollection,
} from './plugin'

/** Configuration of real store schemas and initial cached records. */
interface RelationStoreOptions {
  /** Collection metadata, including custom composite/non-primary-key joins. */
  collections?: any[]
  /** Initial records written through the real cache. */
  cacheItems?: Record<string, any[]>
  /** Query shapes whose completed cache reads these seed records represent. */
  cachedQueries?: Record<string, any[]>
}

/** Converts relation metadata fixtures to supported store schema declarations. */
function toSchema(collection: any): any {
  return {
    ...collection,
    scopeId: 'test-scope',
    relations: Object.fromEntries(Object.entries(collection.normalizedRelations ?? {}).map(([key, value]: any) => [key, {
      many: value.many,
      to: Object.fromEntries(value.to.map((target: any) => [target.collection, { on: target.on }])),
    }])),
  }
}

/** Supplies complete schemas so every declared relation resolves in a real store. */
function defaultCollections(): any[] {
  return [
    createTodosCollection(),
    createProfilesCollection(),
    createOrdersCollection(),
    createOrderItemsCollection(),
    {
      name: 'Settings',
      meta: { primaryKeys: ['id'], monospace: { collection: 'Settings' } },
      getKey: (item: any) => item.id,
      normalizedRelations: {},
    },
  ]
}

/** Creates a real store/cache with only the external REST client substituted. */
export async function createRelationStore(client: any, options: RelationStoreOptions = {}): Promise<any> {
  const collections = new Map(defaultCollections().map(collection => [collection.name, collection]))
  for (const collection of options.collections ?? []) {
    collections.set(collection.name, collection)
  }
  const store: any = await createStore({
    schema: [...collections.values()].map(toSchema),
    syncImmediately: false,
    tombstoneGc: false,
    plugins: [createMonospaceRstorePlugin({ client, scopeId: 'test-scope' })],
  })
  for (const [name, items] of Object.entries(options.cacheItems ?? {})) {
    const collection = store.$collections.find((entry: any) => entry.name === name)
    for (const item of items) {
      const queries = options.cachedQueries?.[name] ?? [{}]
      for (const query of queries) {
        const findOptions = store.$resolveFindOptions(collection, query, true, {})
        store.$cache.writeItem({ collection, key: collection.getKey(item), item, marker: getMarker('many', defaultMarker(collection, findOptions)) })
      }
    }
  }
  return store
}

/** Executes published Core query/mutation APIs, preserving form operation inputs. */
export async function runMonospaceOperation(client: any, operation: string, input: Record<string, any>): Promise<any> {
  const store = input.store ?? await createRelationStore(client, { collections: [input.collection] })
  const collection = store.$collections.find((entry: any) => entry.name === input.collection.name)
  const options = { ...input, store, collection }
  switch (operation) {
    case 'createItem': return createItem(options as any)
    case 'createMany': return createMany(options as any)
    case 'updateItem': return updateItem(options as any)
    case 'updateMany': return updateMany(options as any)
    case 'deleteItem': return deleteItem(options as any)
    case 'deleteMany': return deleteMany(options as any)
    case 'fetchFirst': return (await findFirst({ ...options, findOptions: { ...input.findOptions, key: input.key, fetchPolicy: 'fetch-only' } } as any)).result
    case 'fetchMany': return (await findMany({ ...options, findOptions: { ...input.findOptions, fetchPolicy: 'fetch-only' } } as any)).result
    default: throw new Error(`Unsupported public operation: ${operation}`)
  }
}

/** Creates a real default store with an observed external read implementation. */
export function createMonospaceTestStore(readMany: (collection: string, query: any) => Promise<any[]>) {
  const client = createMockClient()
  client.readMany.mockImplementation(readMany)
  return { storePromise: createRelationStore(client), readManyMock: client.readMany, client }
}
