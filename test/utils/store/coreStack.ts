import type { Cache, CollectionDefaults, StoreCore, StoreSchema } from '@rstore/shared'
import type { FakeRemote } from './fakeRemote'
import type { CoreStoreOptions } from './realCacheStore'
import type { StackOptions, StackReaders } from './stack'
import { createCoreStore } from './realCacheStore'
import { createStackReaders, registerAutoDispose, requireStackRemote, resolveStackRemote } from './stack'

/** Options of {@link createCoreStack}: the shared ones plus the core store's. */
export interface CoreStackOptions extends StackOptions, Omit<CoreStoreOptions, 'schema' | 'plugins'> {}

/** A core store, the real cache behind it and the fake backend it talks to. */
export interface CoreStack extends StackReaders {
  /** Core-compatible store with real cache, hooks, and fake remote. */
  store: StoreCore<StoreSchema, CollectionDefaults>
  /** The real Vue cache backing the store. */
  cache: Cache
  /** The fake backend, for request assertions and failure scripting. */
  remote: FakeRemote
  /** Stops the cache background work (tombstone GC timer). */
  dispose: () => void
}

/**
 * Builds a core store on the real cache with a fake remote plugin.
 *
 * Suites built on this stack assert public cache reads and remote effects, and
 * dispose themselves through `onTestFinished`.
 *
 * @param options Schema, store behaviour and fake backend data.
 */
export async function createCoreStack(options: CoreStackOptions): Promise<CoreStack> {
  const { data, keys, on, batch, remote: _remote, plugins: _plugins, autoDispose, ...storeOptions } = options
  const { remote, plugins } = resolveStackRemote('createCoreStack', options)

  const { store, cache, dispose } = await createCoreStore({ ...storeOptions, plugins })
  registerAutoDispose('createCoreStack', options, dispose)

  return {
    store,
    cache,
    get remote() {
      return requireStackRemote('createCoreStack', remote)
    },
    ...createStackReaders(store, cache),
    dispose,
  }
}
