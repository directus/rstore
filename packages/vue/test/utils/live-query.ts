import type { VueStackOptions } from '#test-utils/store/vueStack'
import type { CollectionDefaults, RealtimeHookDefinitions, StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { expect, vi } from 'vitest'

/** Subscribe hook payload, captured for direct connector delivery. */
export type SubscribePayload = Parameters<RealtimeHookDefinitions<StoreSchema, CollectionDefaults>['subscribe']>[0]

/**
 * Real Vue store and cache with a `todos` collection seeded with two rows. Only
 * remote storage and delivery are fake; every subscribe hook payload is kept in
 * `payloads`, in registration order.
 *
 * @param options Store and fake backend options, overriding the defaults.
 */
export async function setupTodos(options: Partial<VueStackOptions> = {}) {
  const stack = await createVueStack({
    schema: [{ name: 'todos' }],
    data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
    ...options,
  })
  const payloads: SubscribePayload[] = []
  stack.store.$hooks.hook('subscribe', (payload: SubscribePayload) => {
    payloads.push(payload)
  })
  return { ...stack, payloads }
}

/**
 * {@link setupTodos} with garbage collection enabled, so tests can observe which
 * rows a published page still owns.
 *
 * @param options Store and fake backend options, overriding the defaults.
 */
export function setupLiveTodos(options: Partial<VueStackOptions> = {}) {
  return setupTodos({ experimentalGarbageCollection: true, ...options })
}

/**
 * Await a subscription registration without coupling to queue internals.
 *
 * @param payloads Payloads captured by {@link setupTodos}.
 * @param index Registration order of the expected subscription.
 */
export async function subscription(payloads: SubscribePayload[], index = 0) {
  await vi.waitFor(() => expect(payloads.length).toBeGreaterThan(index))
  return payloads[index]!
}

/**
 * Write detached wire rows to the cache, as a connector does before publishing
 * their membership with `setResult`.
 *
 * @param store Store owning the `todos` collection.
 * @param rows Rows to write.
 */
export function writeRows(store: any, rows: Array<{ id: string, title: string }>) {
  for (const item of rows) {
    store.$cache.writeItem({ collection: store.$collections[0], key: item.id, item })
  }
}
