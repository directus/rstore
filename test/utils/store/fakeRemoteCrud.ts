import type { FakeRemoteBackend } from './fakeRemoteBackend'
import type { FakeRemoteHookSpec } from './fakeRemoteHandlers'
import type { CallScript, FakeRemoteHook } from './fakeRemoteScript'
import { findMany } from '@rstore/core'

/**
 * The default CRUD behaviour of {@link import('./fakeRemote').createFakeRemote}.
 *
 * One {@link FakeRemoteHookSpec} per per-item hook: what the call records,
 * what the built-in read/write does, and how the answer is published. An `on`
 * handler either replaces `run` or wraps it through `ctx.next()`.
 */

/** An open subscription: the collection it watches and the store to push to. */
export interface FakeRemoteSubscription {
  /** Collection the subscription watches. */
  collection: string
  /** Store whose cache receives the frames. */
  store: any
}

/** Per-item hooks the fake remote answers by default. */
export type FakeRemoteCrudHook = Exclude<FakeRemoteHook, 'batch' | 'batchFetch' | 'batchMutate'>

/** What {@link createCrudHookSpecs} needs from the surrounding fake remote. */
export interface CrudSpecOptions {
  /** The rows every hook reads and writes. */
  backend: FakeRemoteBackend
  /** Recording and one-shot `respondNext` responses. */
  script: CallScript
  /** Open subscriptions, keyed by subscription id. */
  subscriptions: Map<string, FakeRemoteSubscription>
}

/**
 * Builds the specs of the eleven per-item hooks.
 *
 * The mutation hooks apply `script.respond` to the value they are about to
 * write, not to the row they return, so a `respondNext` that rewrites a key
 * ("the server assigns the id") ends up in the backend rows as well as in the
 * store.
 *
 * @param options The backend, the call script and the subscription registry.
 */
export function createCrudHookSpecs(options: CrudSpecOptions): Record<FakeRemoteCrudHook, FakeRemoteHookSpec> {
  const { backend, script, subscriptions } = options

  /** `payload.setResult`, the answer path of every result-bearing hook. */
  const setResult: FakeRemoteHookSpec['commit'] = (ctx, value) => ctx.payload.setResult(value)

  return {
    fetchFirst: {
      call: payload => ({ collection: payload.collection.name, key: payload.key, findOptions: payload.findOptions }),
      // A keyed read bypasses `where`/`orderBy`, like a `GET /todos/1` route.
      run: ctx => ctx.key != null
        ? ctx.rows().find(row => ctx.getKey(row) === ctx.key)
        : ctx.select()[0],
      commit: setResult,
    },

    fetchMany: {
      call: payload => ({ collection: payload.collection.name, findOptions: payload.findOptions }),
      run: ctx => ctx.select(),
      commit: setResult,
    },

    fetchRelations: {
      call: payload => ({ collection: payload.collection.name, findOptions: payload.findOptions }),
      run: async (ctx) => {
        const result = ctx.payload.getResult()
        const items: any[] = (Array.isArray(result) ? result : [result]).filter(item => item != null)
        await fetchIncluded(ctx.store, ctx.resolved, items, ctx.findOptions.include)
      },
    },

    createItem: {
      call: payload => ({ collection: payload.collection.name, item: payload.item }),
      run: ctx => ctx.upsert(script.respond(ctx.item!, ctx.call)),
      commit: setResult,
    },

    createMany: {
      call: payload => ({ collection: payload.collection.name, items: payload.items }),
      run: (ctx) => {
        const items = script.respond(ctx.items!, ctx.call)
        return items.map((item: any) => ctx.upsert(item))
      },
      commit: setResult,
    },

    updateItem: {
      call: payload => ({ collection: payload.collection.name, key: payload.key, item: payload.item }),
      // The mutation key, not the item, says which row is written.
      run: ctx => ctx.upsert(script.respond(
        backend.withKey(ctx.collection, ctx.item!, ctx.key!),
        ctx.call,
      )),
      commit: setResult,
    },

    updateMany: {
      call: payload => ({
        collection: payload.collection.name,
        keys: payload.items.map((entry: any) => entry.key),
        items: payload.items,
      }),
      run: (ctx) => {
        const items = script.respond(
          ctx.items!.map(({ key, item }: any) => backend.withKey(ctx.collection, item, key)),
          ctx.call,
        )
        return items.map((item: any) => ctx.upsert(item))
      },
      commit: setResult,
    },

    deleteItem: {
      call: payload => ({ collection: payload.collection.name, key: payload.key }),
      run: ctx => ctx.remove(ctx.key!),
    },

    deleteMany: {
      call: payload => ({ collection: payload.collection.name, keys: payload.keys }),
      run: ctx => backend.removeMany(ctx.collection, ctx.keys!),
    },

    subscribe: {
      call: payload => ({
        collection: payload.collection.name,
        key: payload.key,
        findOptions: payload.findOptions,
        subscriptionId: payload.subscriptionId,
      }),
      run: (ctx) => {
        subscriptions.set(ctx.subscriptionId!, { collection: ctx.collection, store: ctx.store })
      },
    },

    unsubscribe: {
      call: payload => ({
        collection: payload.collection.name,
        key: payload.key,
        findOptions: payload.findOptions,
        subscriptionId: payload.subscriptionId,
      }),
      run: (ctx) => {
        subscriptions.delete(ctx.subscriptionId!)
      },
    },
  }
}

/**
 * Loads the rows of each included relation through the store, so the cache
 * normalizes them exactly like a real connector's `fetchRelations` would.
 *
 * Uses the Vue collection API when present and falls back to the core
 * `findMany`, so the same remote also works with a core-only store.
 *
 * @param store The store that issued the parent query.
 * @param collection The resolved collection the relations start from.
 * @param items The parent items whose relations are being loaded.
 * @param include The `include` tree of the parent find options.
 */
async function fetchIncluded(store: any, collection: any, items: any[], include: Record<string, any>) {
  for (const [relationName, nested] of Object.entries(include)) {
    if (!nested) {
      continue
    }
    const relation = collection.normalizedRelations?.[relationName]
    if (!relation) {
      throw new Error(`Unknown relation ${collection.name}.${relationName}`)
    }
    for (const target of relation.to) {
      for (const [targetField, sourceField] of Object.entries(target.on) as Array<[string, string]>) {
        const values = [...new Set(items.map(item => item[sourceField]).filter(value => value != null))]
        if (!values.length) {
          continue
        }
        const findOptions = {
          params: { where: { [targetField]: { $in: values } } },
          include: getNestedInclude(nested),
        }
        if (typeof store.$collection === 'function') {
          await store.$collection(target.collection).findMany(findOptions)
        }
        else {
          const targetCollection = store.$collections.find((c: any) => c.name === target.collection)
          if (!targetCollection) {
            throw new Error(`Unknown collection ${target.collection}`)
          }
          await findMany({ store, collection: targetCollection, findOptions: findOptions as any })
        }
      }
    }
  }
}

/** Read either supported nested-include syntax from a relation request. */
function getNestedInclude(nested: unknown): Record<string, any> | undefined {
  if (!nested || typeof nested !== 'object') {
    return undefined
  }
  const candidate = nested as Record<string, unknown>
  return ('include' in candidate ? candidate.include : candidate) as Record<string, any> | undefined
}
