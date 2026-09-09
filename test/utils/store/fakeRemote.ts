import type { Plugin } from '@rstore/shared'
import type { FakeRemoteKeys } from './fakeRemoteBackend'
import type { FakeRemoteSubscription } from './fakeRemoteCrud'
import type { FakeRemoteHandler, FakeRemoteHandlers, FakeRemoteHookSpec } from './fakeRemoteHandlers'
import type { FakeRemoteFrame } from './fakeRemoteRealtime'
import type { CallScript, FakeRemoteBatchHook, FakeRemoteHook, HoldOptions } from './fakeRemoteScript'
import { createFakeRemoteBackend } from './fakeRemoteBackend'
import { createBatchHookSpecs, resolveBatchHooks } from './fakeRemoteBatch'
import { createCrudHookSpecs } from './fakeRemoteCrud'
import { runFakeRemoteHook } from './fakeRemoteHandlers'
import { deliverFrame } from './fakeRemoteRealtime'
import { createCallScript } from './fakeRemoteScript'

export type { FakeRemoteGetKey, FakeRemoteKeyResolver, FakeRemoteKeys, FakeRemoteParams } from './fakeRemoteBackend'
export type { FakeRemoteHandler, FakeRemoteHandlerContext, FakeRemoteHandlers } from './fakeRemoteHandlers'
export type { FakeRemoteFrame } from './fakeRemoteRealtime'
export type { FakeRemoteBatchHook, FakeRemoteCall, FakeRemoteHook, FakeRemoteResponder, HoldOptions } from './fakeRemoteScript'

export interface FakeRemoteOptions {
  /** Initial rows, keyed by collection name. */
  data?: Record<string, Array<Record<string, any>>>
  /** Restricts the plugin to collections carrying this scope. */
  scopeId?: string
  /** Key field, key function, or one of either per collection. Default `'id'`. */
  keys?: FakeRemoteKeys
  /**
   * Persistent per-hook deviations from the default CRUD behaviour.
   *
   * A handler replaces the built-in read/write, or wraps it by awaiting
   * `ctx.next()`. `respondNext` still wins over a handler, because it is
   * applied to whatever value the handler produced.
   */
  on?: FakeRemoteHandlers
  /**
   * Batch hooks to register. `true` means `['batchFetch', 'batchMutate']`.
   *
   * Off by default: a registered batch hook resolves the operations of a whole
   * group, so the per-item hooks would stop being called.
   */
  batch?: boolean | FakeRemoteBatchHook[]
  /**
   * Reads the key of a row.
   *
   * @deprecated Use {@link FakeRemoteOptions.keys}.
   */
  getKey?: (collection: string, item: Record<string, any>) => string | number
  /**
   * Identity of the client this remote belongs to.
   *
   * A frame emitted with the same `clientId` is treated as the echo of a local
   * mutation and never reaches the cache, like a real connector's skip-self
   * suppression.
   */
  clientId?: string
}

/**
 * A scripted in-memory backend exposed as a real rstore plugin.
 *
 * Integration tests use it instead of collection `hooks` so they exercise the
 * same plugin pipeline production code uses, while still controlling latency,
 * failures, responses and realtime frames.
 *
 * Built through `createCoreStack` / `createVueStack` rather than directly —
 * they own its lifecycle and pass the `data` / `keys` / `on` / `batch` options
 * straight through.
 */
export interface FakeRemote extends Pick<
  CallScript,
  'calls' | 'requests' | 'lastRequest' | 'callCount' | 'failNext' | 'latency' | 'respondNext'
> {
  /** The rstore plugin to pass to `createStore`. */
  plugin: Plugin
  /** Replaces the rows of a collection. */
  seed: (collection: string, rows: Array<Record<string, any>>) => void
  /** Current backend rows of a collection (copies). */
  rows: (collection: string) => Array<Record<string, any>>
  /** Primary key of a row, resolved through the `keys` option. */
  getKey: (collection: string, item: Record<string, any>) => string | number
  /**
   * Installs, replaces or (with `null`) removes a handler mid-test.
   *
   * The same deviation the `on` option registers, for a test that only needs
   * it after some state has been set up.
   */
  on: (hook: FakeRemoteHook, handler: FakeRemoteHandler | null) => void
  /** Holds the next call(s) of `hook` until the returned function is called. */
  holdNext: (hook: FakeRemoteHook, options?: HoldOptions) => () => void
  /**
   * Applies a realtime frame to the backend, then pushes it into every store
   * with an open subscription on that collection.
   */
  emit: (frame: FakeRemoteFrame) => void
  /** Ids of the currently open subscriptions. */
  subscriptions: () => string[]
}

/**
 * Creates a fake remote backend and its rstore plugin.
 *
 * @param options Initial data and behaviour of the backend.
 */
export function createFakeRemote(options: FakeRemoteOptions = {}): FakeRemote {
  const backend = createFakeRemoteBackend(options.data, { keys: options.keys, getKey: options.getKey })
  const script = createCallScript()
  const subscriptions = new Map<string, FakeRemoteSubscription>()
  // Looked up on every call rather than captured, so `remote.on()` takes
  // effect on the calls that follow it.
  const handlers: FakeRemoteHandlers = { ...options.on }

  const crudSpecs = createCrudHookSpecs({ backend, script, subscriptions })
  const batchSpecs = createBatchHookSpecs(backend)
  const specs: Partial<Record<FakeRemoteHook, FakeRemoteHookSpec>> = {
    ...crudSpecs,
    ...Object.fromEntries(resolveBatchHooks(options.batch).map(hook => [hook, batchSpecs[hook]])),
  }

  const plugin: Plugin = {
    name: 'fake-remote',
    category: 'remote',
    scopeId: options.scopeId,
    setup({ hook }) {
      for (const [name, spec] of Object.entries(specs) as Array<[FakeRemoteHook, FakeRemoteHookSpec]>) {
        hook(name as any, (payload: any) => runFakeRemoteHook({
          hook: name,
          spec,
          payload,
          script,
          backend,
          handlers,
        }))
      }
    },
  }

  /** Mirrors a frame onto the backend rows, so a later refetch agrees with it. */
  function applyFrameToBackend(frame: FakeRemoteFrame) {
    if (frame.type === 'deleted') {
      backend.remove(frame.collection, frame.key)
    }
    else {
      backend.upsert(frame.collection, frame.item)
    }
  }

  return {
    plugin,
    calls: script.calls,
    requests: script.requests,
    lastRequest: script.lastRequest,
    callCount: script.callCount,
    failNext: script.failNext,
    holdNext: script.holdNext,
    latency: script.latency,
    respondNext: script.respondNext,
    seed: backend.seed,
    rows: backend.rows,
    getKey: backend.getKey,
    on: (hook, handler) => {
      if (handler) {
        handlers[hook] = handler
      }
      else {
        delete handlers[hook]
      }
    },
    emit: (frame) => {
      applyFrameToBackend(frame)
      // Echo of a mutation this client issued: the server saw it and the local
      // cache already has it, so it must not be applied a second time.
      if (frame.clientId != null && frame.clientId === options.clientId) {
        return
      }
      // One write per distinct store, even when several of its queries
      // subscribe to the same collection.
      const stores = new Set<any>()
      for (const subscription of subscriptions.values()) {
        if (subscription.collection === frame.collection) {
          stores.add(subscription.store)
        }
      }
      for (const store of stores) {
        deliverFrame(store, frame)
      }
    },
    subscriptions: () => [...subscriptions.keys()],
  }
}
