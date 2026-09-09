import type { CoreStack } from '#test-utils/store/coreStack'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createMany, findMany } from '@rstore/core'
import { expect, onTestFinished, vi } from 'vitest'

/** Core stack for many-mutation integration specs. */
export function setupManyMutationStack(rows: Array<Record<string, any>> = []) {
  return createCoreStack({ schema: [{ name: 'todos' }], data: { todos: rows } })
}

/** Populate the real cache from the scripted backend. */
export function loadManyMutationRows(stack: CoreStack) {
  return findMany({ store: stack.store, collection: stack.collection('todos') })
}

/** Cached titles keyed by their resolved public keys. */
export function cachedTitles(stack: CoreStack) {
  return Object.fromEntries(stack.readMany('todos').map(item => [item.$getKey(), item.title]))
}

/** Cached public keys in cache order. */
export function cachedKeys(stack: CoreStack) {
  return stack.readMany('todos').map(item => item.$getKey())
}

/** Suppress the deliberate diagnostic emitted by prevented layer writes. */
export function silenceLayerError() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  onTestFinished(() => spy.mockRestore())
}

/** Hold a real create-many layer that prevents writes for its keys. */
export async function holdPreventingCreate(stack: CoreStack, items: Array<Record<string, any>>) {
  const release = stack.remote.holdNext('createMany')
  const pending = createMany({
    store: stack.store,
    collection: stack.collection('todos'),
    items: items as any,
  })
  await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))
  return async () => {
    release()
    await pending
  }
}

/** A stack whose operations are answered exclusively by supplied plugins. */
export function pluginOnlyStack(plugins: Array<Record<string, any>>) {
  return createCoreStack({ schema: [{ name: 'todos' }], remote: false, plugins: plugins as any })
}
