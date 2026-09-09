import type { Cache, Plugin, ResolvedCollection, StoreSchema, WrappedItem } from '@rstore/shared'
import type { FakeRemote, FakeRemoteBatchHook, FakeRemoteHandlers, FakeRemoteKeys, FakeRemoteOptions } from './fakeRemote'
import { onTestFinished } from 'vitest'
import { createFakeRemote } from './fakeRemote'

/**
 * The pieces `createCoreStack` and `createVueStack` share.
 *
 * Both build the same thing — a real store on the real cache, talking to one
 * fake backend. Core suites call exported operations; Vue suites also own
 * reactive consumer scopes. Remote configuration, teardown registration and
 * public cache readers have one implementation here.
 */

/** Options both stack factories accept, on top of their own store options. */
export interface StackOptions {
  /** The collections of the store. */
  schema: StoreSchema
  /** Initial backend rows, keyed by collection name. */
  data?: Record<string, Array<Record<string, any>>>
  /** Key field, key function, or one of either per collection. Default `'id'`. */
  keys?: FakeRemoteKeys
  /**
   * Persistent per-hook deviations from the default CRUD behaviour.
   *
   * A handler replaces the built-in read/write, or wraps it by awaiting
   * `ctx.next()`. `respondNext` still wins over a handler.
   */
  on?: FakeRemoteHandlers
  /** Batch hooks to register. `true` means `['batchFetch', 'batchMutate']`. */
  batch?: boolean | FakeRemoteBatchHook[]
  /**
   * `false` registers no remote plugin, for a suite that only wants its own.
   *
   * Passing an existing {@link FakeRemote} shares one backend between two
   * stores, which is how an SSR boundary is reproduced. `data`, `keys`, `on`
   * and `batch` are then read from that remote, not from these options.
   */
  remote?: false | FakeRemote | FakeRemoteOptions
  /** Extra plugins, registered after the remote. */
  plugins?: Plugin[] | ((remote: FakeRemote) => Plugin[])
  /**
   * Disposes the stack through `onTestFinished`.
   *
   * @default true
   */
  autoDispose?: boolean
}

/** Narrowing options accepted by {@link StackReaders.readMany}. */
export interface StackReadManyOptions {
  /** Keeps only the items this predicate accepts. */
  filter?: (item: WrappedItem<any, any, any>) => boolean
  /** Returns nothing unless a query wrote this marker. */
  marker?: string
  /** Reads only these keys. */
  keys?: Array<string | number>
}

/** Cache reads every stack exposes, through the public `Cache` API. */
export interface StackReaders {
  /** Resolves a collection by name, throwing when the schema has no such one. */
  collection: (name: string) => ResolvedCollection<any, any, any>
  /** Reads one item by key through the public cache API. */
  read: (collection: string, key: string | number) => WrappedItem<any, any, any> | undefined
  /** Reads every cached item of a collection, optionally narrowed. */
  readMany: (collection: string, findOptions?: StackReadManyOptions) => Array<WrappedItem<any, any, any>>
}

/** What {@link resolveStackRemote} produces from the shared options. */
export interface ResolvedStackRemote {
  /** The fake backend, or `null` when the stack was built with `remote: false`. */
  remote: FakeRemote | null
  /** The remote plugin, when there is one, followed by the extra plugins. */
  plugins: Plugin[]
}

/**
 * Builds the fake remote and the plugin list of a stack.
 *
 * @param factory Name of the calling factory, for error messages.
 * @param options The shared stack options.
 */
export function resolveStackRemote(factory: string, options: StackOptions): ResolvedStackRemote {
  const { data, keys, on, batch, plugins = [] } = options
  const remote = options.remote === false
    ? null
    // An existing remote is shared as-is; anything else configures a new one.
    : isFakeRemote(options.remote)
      ? options.remote
      : createFakeRemote({ data, keys, on, batch, ...options.remote })

  if (typeof plugins === 'function' && !remote) {
    throw new Error(`${factory}: \`plugins\` as a function needs a remote, but \`remote: false\` was passed`)
  }

  return {
    remote,
    plugins: [
      ...remote ? [remote.plugin] : [],
      ...typeof plugins === 'function' ? plugins(remote!) : plugins,
    ],
  }
}

/** Whether `remote` is an already built {@link FakeRemote}. */
function isFakeRemote(remote: StackOptions['remote']): remote is FakeRemote {
  return remote != null && remote !== false && 'plugin' in remote
}

/**
 * Reads the remote of a stack, or explains why there is none.
 *
 * @param factory Name of the factory that built the stack.
 * @param remote The remote, or `null` for a `remote: false` stack.
 */
export function requireStackRemote(factory: string, remote: FakeRemote | null): FakeRemote {
  if (!remote) {
    throw new Error(`${factory}: this stack was created with \`remote: false\`, so it has no fake backend`)
  }
  return remote
}

/**
 * Disposes the stack when the running test finishes.
 *
 * `onTestFinished` covers every call site — a stack is always built inside an
 * `it` body — works from a nested helper, composes with several stacks in one
 * test, and needs no import in the spec.
 *
 * @param factory Name of the calling factory, for the error message.
 * @param options The shared stack options.
 * @param dispose Tears the stack down.
 */
export function registerAutoDispose(factory: string, options: StackOptions, dispose: () => void): void {
  if (options.autoDispose === false) {
    return
  }
  try {
    onTestFinished(dispose)
  }
  catch {
    throw new Error(`${factory}: no running test — pass autoDispose: false and call stack.dispose() yourself`)
  }
}

/**
 * Builds the cache readers of a stack.
 *
 * @param store The store whose schema resolves collection names.
 * @param cache The cache backing that store.
 */
export function createStackReaders(store: any, cache: Cache): StackReaders {
  function collection(name: string) {
    const resolved = store.$collections.find((c: any) => c.name === name)
    if (!resolved) {
      throw new Error(`Unknown collection ${name}`)
    }
    return resolved as ResolvedCollection<any, any, any>
  }

  return {
    collection,
    read: (name, key) => cache.readItem({ collection: collection(name), key }),
    readMany: (name, findOptions) => cache.readItems({ collection: collection(name), ...findOptions }),
  }
}
