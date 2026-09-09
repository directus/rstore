import type { FakeRemoteBackend } from './fakeRemoteBackend'
import type { CallScript, FakeRemoteCall, FakeRemoteHook } from './fakeRemoteScript'
import { klona } from 'klona'

/**
 * The `on:` machinery of {@link import('./fakeRemote').createFakeRemote}.
 *
 * A test that needs the fake backend to deviate from plain CRUD on one hook
 * used to write a whole `Plugin`, losing the call log, `failNext`, `holdNext`
 * and `latency` with it. A handler registered here keeps all of that and can
 * either replace the built-in behaviour or wrap it through `ctx.next()`.
 */

/**
 * What a hook of the fake remote sees, and what it can do to answer.
 *
 * The backend accessors all default to the collection of the current call, so
 * `ctx.rows()` means "the rows of the collection this hook was called for".
 */
export interface FakeRemoteHandlerContext<TValue = any> {
  /** The hook being handled. */
  hook: FakeRemoteHook
  /** Name of the collection the call targets. */
  collection: string
  /** The `ResolvedCollection` of the call, when the hook payload carries one. */
  resolved: any
  /** The store that issued the call. */
  store: any
  /** Primary key, for single-item hooks. */
  key?: string | number
  /** Primary keys, for `*Many` hooks. */
  keys?: Array<string | number>
  /** Payload item, for `createItem` / `updateItem`. */
  item?: Record<string, any>
  /** Payload items, for `createMany` / `updateMany`. */
  items?: any[]
  /** Find options of the call, as the store resolved them. */
  findOptions?: any
  /** Subscription id, for `subscribe` / `unsubscribe`. */
  subscriptionId?: string
  /** Batch group name, for the batch hooks. */
  group?: string
  /** Mutation type of the batched operations, for `batchMutate`. */
  mutation?: 'create' | 'update' | 'delete'
  /** The recorded call, as `requests()` reports it. */
  call: FakeRemoteCall
  /**
   * The hook payload with request data detached at dispatch.
   *
   * The escape hatch for everything the context does not lift out, e.g.
   * `formOperations`, `meta`, `abort()` and the batch `operations`. Store,
   * collection, response metadata and callbacks retain their live identity.
   */
  payload: any
  /** Copies of the current rows of a collection. */
  rows: (collection?: string) => Array<Record<string, any>>
  /** Applies `where`, `orderBy` and pagination to a collection's rows. */
  select: (findOptions?: any, collection?: string) => Array<Record<string, any>>
  /** Replaces the rows of a collection. */
  seed: (rows: Array<Record<string, any>>, collection?: string) => void
  /** Writes a row, merging into any row with the same key. Returns a copy. */
  upsert: (item: Record<string, any>, collection?: string) => Record<string, any>
  /** Removes a row by key. Returns whether a row was actually removed. */
  remove: (key: string | number, collection?: string) => boolean
  /** Primary key of a row, resolved through the stack's `keys` option. */
  getKey: (item: Record<string, any>, collection?: string) => string | number
  /**
   * Runs the built-in behaviour of the hook and returns its value.
   *
   * Memoized: however often a handler calls it, the read or write happens
   * once. Return it to keep the default (`return ctx.next()`), await it to
   * wrap it. It never publishes the value itself — returning `undefined` from
   * a handler on a result-bearing hook is an explicit "not found".
   */
  next: () => Promise<TValue>
}

/** A persistent per-hook deviation from the default CRUD behaviour. */
export type FakeRemoteHandler<TValue = any> = (ctx: FakeRemoteHandlerContext<TValue>) => any

/** Handlers registered per hook, as the `on` option takes them. */
export type FakeRemoteHandlers = Partial<Record<FakeRemoteHook, FakeRemoteHandler>>

/** The built-in behaviour of one hook of the fake remote. */
export interface FakeRemoteHookSpec<TValue = any> {
  /** Fields of the recorded call, read off the raw hook payload. */
  call: (payload: any) => Omit<FakeRemoteCall, 'hook'>
  /** The built-in read or write. Its return value is what `ctx.next()` gives. */
  run: (ctx: FakeRemoteHandlerContext<TValue>) => TValue | Promise<TValue>
  /**
   * Publishes the answer to the store, normally `payload.setResult(value)`.
   *
   * Omitted for the hooks that carry no result (`delete*`, `subscribe`,
   * `unsubscribe`, `fetchRelations`, and the batch hooks, whose operations
   * resolve themselves).
   */
  commit?: (ctx: FakeRemoteHandlerContext<TValue>, value: TValue) => void
}

/** Everything the dispatch runner needs besides the hook payload. */
export interface FakeRemoteHookRun {
  /** The hook being dispatched. */
  hook: FakeRemoteHook
  /** Its built-in behaviour. */
  spec: FakeRemoteHookSpec
  /** The raw hook payload handed over by the store. */
  payload: any
  /** Recording, latency, holds, failures and one-shot responses. */
  script: CallScript
  /** The rows the built-in behaviour reads and writes. */
  backend: FakeRemoteBackend
  /** Handlers registered through `on`, looked up live so `remote.on()` works. */
  handlers: FakeRemoteHandlers
}

/**
 * Dispatches one hook call of the fake remote.
 *
 * The order is fixed so that wrapping is predictable:
 *
 * 1. `script.enter` records the call and reserves its failure and response
 *    before applying the hold, latency and failure.
 * 2. The registered handler runs, or `ctx.next()` when there is none.
 * 3. `script.respond` applies a `respondNext` responder, which is why
 *    `respondNext` still wins over an `on` handler: a responder consumed
 *    inside `next()` is one-shot and passes the value straight through here,
 *    and one left pending by a handler that answered on its own is applied to
 *    that handler's value.
 * 4. `spec.commit` publishes the value, once, only for result-bearing hooks.
 *
 * @param options The hook, its spec, the payload and the shared state.
 */
export async function runFakeRemoteHook(options: FakeRemoteHookRun): Promise<void> {
  const { hook, spec, script, backend, handlers } = options
  const payload = snapshotRequestPayload(options.payload)
  const fields = spec.call(payload)
  const call = await script.enter(hook, fields)
  const collection = fields.collection

  let ran = false
  let value: any

  const ctx: FakeRemoteHandlerContext = {
    hook,
    collection,
    resolved: payload.collection,
    store: payload.store,
    key: fields.key,
    keys: fields.keys,
    item: fields.item,
    items: fields.items,
    findOptions: fields.findOptions,
    subscriptionId: fields.subscriptionId,
    group: fields.group,
    mutation: fields.mutation,
    call,
    payload,
    rows: name => backend.rows(name ?? collection),
    select: (findOptions, name) => backend.select(name ?? collection, findOptions ?? fields.findOptions),
    seed: (rows, name) => backend.seed(name ?? collection, rows),
    upsert: (item, name) => backend.upsert(name ?? collection, item),
    remove: (key, name) => backend.remove(name ?? collection, key),
    getKey: (item, name) => backend.getKey(name ?? collection, item),
    next: async () => {
      if (!ran) {
        ran = true
        value = await spec.run(ctx)
      }
      return value
    },
  }

  const handler = handlers[hook]
  const produced = handler ? await handler(ctx) : await ctx.next()
  if (spec.commit) {
    // Response parsing belongs to the client, including responses supplied by
    // custom handlers. No nested response value may alias backend storage.
    spec.commit(ctx, klona(script.respond(produced, call)))
  }
}

/**
 * Capture transport values before a hold yields to caller or plugin edits.
 * Keep the hook's store, metadata and response callbacks live: they are the
 * client boundary, not data sent to the backend. Batch operations need the
 * same separation while retaining their individual result callbacks.
 */
function snapshotRequestPayload(payload: any): any {
  const snapshot = { ...payload }
  for (const key of ['item', 'items', 'keys', 'findOptions', 'formOperations']) {
    if (key in payload) {
      snapshot[key] = klona(payload[key])
    }
  }
  if (payload.operations) {
    snapshot.operations = payload.operations.map(snapshotRequestPayload)
  }
  return snapshot
}
