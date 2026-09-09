import type { Cache } from '@rstore/shared'
import type { CreateStoreOptions } from '../../../packages/vue/src'
import type { FakeRemote } from './fakeRemote'
import type { StackOptions, StackReaders } from './stack'
import { effectScope } from 'vue'
import { createIntegrationStore } from './integrationStore'
import { createStackReaders, registerAutoDispose, requireStackRemote, resolveStackRemote } from './stack'

/** Options of {@link createVueStack}: the shared ones plus `createStore`'s. */
export interface VueStackOptions extends StackOptions, Omit<CreateStoreOptions, 'schema' | 'plugins'> {}

/** A scope opened by {@link VueStack.scope}, as a component setup would. */
export interface VueStackScope<T> {
  /** What the callback returned. */
  result: T
  /** Stops the scope, firing every `tryOnScopeDispose` registered inside it. */
  stop: () => void
}

/** A Vue store, the real cache behind it and the fake backend it talks to. */
export interface VueStack extends StackReaders {
  /**
   * The real Vue store.
   *
   * Typed loosely on purpose: the integration suites build ad-hoc schemas and
   * assert runtime behaviour, so a precise store type would only add casts.
   * The typed store API is covered by `packages/vue/test/*.test-d.ts`.
   */
  store: any
  /** The real Vue cache backing the store. */
  cache: Cache
  /** The fake backend, for request assertions and failure scripting. */
  remote: FakeRemote
  /** Runs `fn` inside the stack's effect scope (needed by `liveQuery`). */
  run: <T>(fn: () => T) => T
  /**
   * Runs `fn` in a child scope that can be stopped on its own.
   *
   * Stands in for one component: `stop()` unmounts it, and the stack's own
   * teardown stops it too, so a test never has to pair the two by hand.
   */
  scope: <T>(fn: () => T) => VueStackScope<T>
  /** Stops every scope of the stack and the cache background work. */
  dispose: () => void
}

/**
 * Builds a Vue store on the real cache with a fake remote plugin.
 *
 * Replaces the `createFakeRemote` + `createIntegrationStore` + `disposers`
 * array + `afterEach` block every integration suite used to repeat: the stack
 * disposes itself through `onTestFinished`.
 *
 * @param options Schema, store behaviour and fake backend data.
 */
export async function createVueStack(options: VueStackOptions): Promise<VueStack> {
  const { data, keys, on, batch, remote: _remote, plugins: _plugins, autoDispose, ...storeOptions } = options
  const { remote, plugins } = resolveStackRemote('createVueStack', options)

  const base = await createIntegrationStore({ ...storeOptions, plugins } as any)
  const { store, scope } = base
  const cache = store.$cache as Cache

  function dispose() {
    base.dispose()
    cache.dispose()
  }
  registerAutoDispose('createVueStack', options, dispose)

  return {
    store,
    cache,
    get remote() {
      return requireStackRemote('createVueStack', remote)
    },
    run: fn => scope.run(fn)!,
    // Created inside the stack's scope, so it is also stopped by `dispose()`.
    scope: (fn) => {
      const child = scope.run(() => effectScope())!
      return {
        result: child.run(fn)!,
        stop: () => child.stop(),
      }
    },
    ...createStackReaders(store, cache),
    dispose,
  }
}
