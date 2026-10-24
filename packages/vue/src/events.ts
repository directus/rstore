import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'
import { effectScope, onScopeDispose } from 'vue'

export const realtimeReconnectEventHook = createEventHook()

export const cacheWriteEventHook = createEventHook<{
  collection: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>
  key?: string | number
  result?: Array<any>
  operation: 'write' | 'delete'
}>()

/** Store surface needed to observe its cache disposal. */
interface DisposableStore {
  /** Store hooks, emitting `dispose` once when the cache is disposed. */
  $hooks: {
    /** Register a hook callback. */
    hook: (name: 'dispose', callback: () => void) => unknown
  }
  /** Vue cache, which knows whether it was disposed before any observation. */
  $cache?: {
    /** Private cache API. */
    _private?: {
      /** Whether `dispose()` already ran. */
      isDisposed?: () => boolean
    }
  }
}

/** Pending module-level listener releases of each store, run on its disposal. */
const storeReleases = new WeakMap<DisposableStore, Set<() => void>>()

/**
 * Stores whose `dispose` hook already ran. It runs once: a listener bound
 * afterwards (code resuming after an `await`) must be released at once.
 * Stores disposed before any observation are detected through their cache.
 */
const disposedStores = new WeakSet<DisposableStore>()

/**
 * Get the pending releases of a store, observing its disposal on first use.
 *
 * Kept apart from {@link releaseWithStore}: V8 shares one closure context
 * between closures created by the same call, so a `dispose` hook created
 * there would retain the first listener's `off` for the store's lifetime.
 */
function getStoreReleases(store: DisposableStore): Set<() => void> {
  let releases = storeReleases.get(store)
  if (!releases) {
    const created = releases = new Set()
    storeReleases.set(store, created)
    store.$hooks.hook('dispose', () => {
      disposedStores.add(store)
      // Each release deletes itself; Set iteration tolerates that.
      for (const release of created) {
        release()
      }
    })
  }
  return releases
}

/**
 * Bind a module-level listener to the store's lifetime.
 *
 * Module-level hooks outlive every store. A listener registered outside an
 * effect scope (a plugin, code after an `await`) has no scope disposal to
 * remove it, so it would retain its query and store forever. Disposing the
 * store's cache now releases it too. One `dispose` hook per store keeps
 * releasing many listeners cheap.
 *
 * @param store Store owning the listener.
 * @param off Removes the listener from the module-level hook. Called at once
 * when the store is already disposed.
 * @returns Releases the listener early (scope disposal, option change),
 * also forgetting it on the store. Calling it again does nothing.
 */
export function releaseWithStore(store: DisposableStore, off: () => void): () => void {
  if (disposedStores.has(store) || store.$cache?._private?.isDisposed?.()) {
    off()
    return () => {}
  }
  const pending = getStoreReleases(store)
  let released = false
  /** Remove the listener once, whichever lifetime ends first. */
  function release() {
    if (released)
      return
    released = true
    pending.delete(release)
    off()
  }
  pending.add(release)
  return release
}

/**
 * Run `fn` in an effect scope ending with the caller scope or the store,
 * whichever ends first.
 *
 * Watchers of reactive options are not module-level, but a long-lived
 * source (a route, a global store) retains them, and through them the store.
 * Without a caller scope nothing would ever stop them.
 *
 * @param store Store whose disposal stops the scope.
 * @param fn Setup to run in the scope.
 * @returns What `fn` returned.
 */
export function runWithStoreLifetime<T>(store: DisposableStore, fn: () => T): T {
  // Not detached: a caller scope collects and stops it like its own effects.
  const scope = effectScope()
  let release: (() => void) | undefined
  const result = scope.run(() => {
    // Forget the store callback when the caller scope stops first.
    onScopeDispose(() => release?.())
    return fn()
  }) as T
  // Registered after setup: an already disposed store stops the scope at
  // once, which must not happen while `fn` still creates effects in it.
  release = releaseWithStore(store, () => scope.stop())
  return result
}
