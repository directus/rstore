import type { Cache, CustomCacheState } from '@rstore/shared'

/**
 * The SSR boundary, as a pair of functions.
 *
 * A Nuxt app serializes `store.$cache.getState()` into the payload on
 * `app:rendered` and calls `store.$cache.setState(payload)` on the client
 * (`packages/nuxt/src/runtime/plugin.ts:42`). Nothing but the three
 * minute-scale `nuxt-boot` tests crosses that boundary, so these helpers
 * reproduce it in-process — including the clone, so a hydration test can never
 * pass by accident because both stores share a live object.
 */

/**
 * Clones a `getState()` payload the way the SSR payload transport does.
 *
 * `structuredClone` is deliberate: it throws on anything the real payload
 * could not carry (functions, class instances, Vue proxies of those), which is
 * the failure a hydration test wants to see.
 *
 * @param state The result of `store.$cache.getState()` on the server store.
 */
export function serializeCacheState(state: CustomCacheState): CustomCacheState {
  return structuredClone(state)
}

/**
 * Hydrates a client cache from a serialized server state.
 *
 * @param cache The client store's cache (`store.$cache`).
 * @param state A payload produced by `getState()`, cloned before it is applied
 * so the two stores never share a reference.
 */
export function hydrate(cache: Cache, state: CustomCacheState): void {
  cache.setState(serializeCacheState(state))
}
