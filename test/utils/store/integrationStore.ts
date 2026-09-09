import type { CollectionDefaults, StoreSchema } from '@rstore/shared'
import type { CreateStoreOptions } from '@rstore/vue'
import type { EffectScope } from 'vue'
import { onTestFinished } from 'vitest'
import { effectScope } from 'vue'
import { createStore } from '../../../packages/vue/src'

/**
 * Typed factory for direct public Cache and inline collection-hook contracts.
 * Store workflows with scoped queries should use createVueStack instead.
 */
export async function createTestStore<const TSchema extends StoreSchema, const TDefaults extends CollectionDefaults = CollectionDefaults>(options: CreateStoreOptions<TSchema, TDefaults>) {
  const store = await createStore(options)
  onTestFinished(() => store.$cache.dispose())
  return store
}

/** A store created for a test, plus the scope owning its queries. */
export interface IntegrationStore {
  /**
   * The real Vue store.
   *
   * Typed loosely on purpose: the integration suites build ad-hoc schemas and
   * assert runtime behaviour, so a precise store type would only add casts.
   * The typed store API is covered by `packages/vue/test/*.test-d.ts`.
   */
  store: any
  /** The scope owning the queries, for nesting a child scope into it. */
  scope: EffectScope
  /** Runs `fn` inside the store's effect scope (needed by `liveQuery`). */
  run: <T>(fn: () => T) => T
  /** Stops every effect created through {@link IntegrationStore.run}. */
  dispose: () => void
}

/**
 * Creates a real store for an integration test.
 *
 * The internal `createStore` + `effectScope` pairing behind `createVueStack`,
 * which is what a suite should build. Kept apart so the stack factory only has
 * to describe the harness it adds on top.
 *
 * @param options Store options, forwarded to `createStore`.
 * @param options.schema The collections of the store.
 * @param options.plugins Plugins to register, e.g. a fake remote.
 */
export async function createIntegrationStore(options: {
  schema: StoreSchema
  plugins?: any[]
  [key: string]: any
}): Promise<IntegrationStore> {
  const store = await createStore({ plugins: [], ...options } as any)
  const scope = effectScope()
  return {
    store,
    scope,
    run: fn => scope.run(fn)!,
    dispose: () => scope.stop(),
  }
}
