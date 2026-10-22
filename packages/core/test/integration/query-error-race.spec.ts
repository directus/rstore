import type { CollectionDefaults, HookDefinitions, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany } from '@rstore/core'
import { expect, it } from 'vitest'

/** Failure events published by actual Core query lifecycle. */
type FetchError = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['fetchError']>[0]

// Real public Core query, hooks and cache; external remote gates only. A held
// background request fails after relations already rejected. One operation has
// one terminal event even though both promises preserve their own rejection.
it.each([false, true])('reports relation/background failure race once (many: %s)', async (many) => {
  const stack = await createCoreStack({
    factory: 'core',
    schema: [{ name: 'todos', relations: { children: { many: true, to: { children: { on: { todoId: 'id' } } } } } }, { name: 'children' }],
    data: { todos: [{ id: 'target', title: 'Original' }] },
  })
  const relationError = new Error('relation refused first')
  const backgroundError = new Error('background refused later')
  const errors: FetchError[] = []
  stack.store.$hooks.hook('fetchError', (payload) => {
    errors.push(payload)
  })
  const fetchHook = many ? 'fetchMany' : 'fetchFirst'
  stack.remote.failNext('fetchRelations', relationError)
  stack.remote.failNext(fetchHook, backgroundError)
  const release = stack.remote.holdNext(fetchHook)
  try {
    const collection = stack.collection('todos')
    await expect(many
      ? findMany({ store: stack.store, collection, findOptions: { include: { children: true }, fetchPolicy: 'cache-and-fetch' } })
      : findFirst({ store: stack.store, collection, findOptions: { key: 'target', include: { children: true }, fetchPolicy: 'cache-and-fetch' } })).rejects.toBe(relationError)
    expect(stack.remote.callCount(fetchHook)).toBe(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.error).toBe(relationError)
    release()
    // Released scripted remote has no timers or unresolved work. Node drains
    // promise continuations before the next event-loop turn.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(errors).toHaveLength(1)
    expect(errors[0]!.error).toBe(relationError)
    expect(stack.read('todos', 'target')).toBeUndefined()
  }
  finally {
    release()
  }
})
