import type { CoreStack } from '#test-utils/store/coreStack'
import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it } from 'vitest'

function setup(data: Record<string, Array<Record<string, any>>> = {}) {
  return createCoreStack({ schema: [{ name: 'todos' }], data })
}

function seedCache(stack: CoreStack, item: Record<string, any>) {
  stack.cache.writeItem({ collection: stack.collection('todos'), key: item.id, item })
}

describe('$mutate', () => {
  function setupWithHooks(register: (hook: any) => void, data?: Record<string, Array<Record<string, any>>>) {
    return createCoreStack({
      schema: [{ name: 'todos' }],
      data,
      plugins: [{ name: 'mutation-hooks', setup: ({ hook }) => register(hook) }],
    })
  }

  it('caches the result the after hook set, from the item the before hook modified', async () => {
    const stack = await setupWithHooks((hook) => {
      hook('beforeMutation', ({ modifyItem }: any) => modifyItem('name', 'From before hook'))
      hook('afterMutation', ({ setResult }: any) => setResult({ id: 2, name: 'Changed' }))
    })
    let itemSeenByCallback: unknown

    const result = await stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'create',
      item: { name: 'Original' },
    }, ({ item }) => {
      itemSeenByCallback = item
      return { id: 1, name: 'From callback' }
    })

    expect(itemSeenByCallback).toEqual({ name: 'From before hook' })
    // The after hook's result — not the callback's — is what the caller and
    // the cache both see, under the key that result carries.
    expect(result).toEqual({ id: 2, name: 'Changed' })
    expect(stack.read('todos', 2)).toMatchObject({ id: 2, name: 'Changed' })
    expect(stack.read('todos', 1)).toBeUndefined()
    // A custom callback replaces the collection's own create hook, so nothing
    // reaches the backend.
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.store.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: stack.collection('todos'),
      key: 2,
      payload: { name: 'From before hook' },
    })
  })

  it('replaces a beforeMutation item, then recalculates its inferred key', async () => {
    const stack = await setupWithHooks((hook) => {
      hook('beforeMutation', ({ setItem }: any) => {
        setItem({ id: 'replacement', title: 'Replaced by hook' })
      })
    })
    let callbackPayload: unknown

    const result = await stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'create',
      item: { id: 'original', title: 'Original' },
    }, ({ item, key }) => {
      callbackPayload = { item, key }
      return item
    })

    expect(callbackPayload).toEqual({
      key: 'replacement',
      item: { id: 'replacement', title: 'Replaced by hook' },
    })
    expect(result).toMatchObject({ id: 'replacement', title: 'Replaced by hook' })
    expect(stack.read('todos', 'replacement')).toMatchObject({ title: 'Replaced by hook' })
    expect(stack.read('todos', 'original')).toBeUndefined()
    expect(stack.store.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: stack.collection('todos'),
      key: 'replacement',
      payload: { id: 'replacement', title: 'Replaced by hook' },
    })
  })

  it('removes exactly the deleted keys from the cache in many mode', async () => {
    const stack = await setup()
    for (const item of [{ id: 1 }, { id: 2 }, { id: 3 }]) {
      seedCache(stack, item)
    }
    let keysSeenByCallback: unknown

    const result = await stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'delete',
      keys: [1, 2],
    }, ({ keys }) => {
      keysSeenByCallback = keys
    })

    expect(result).toBeUndefined()
    expect(keysSeenByCallback).toEqual([1, 2])
    expect(stack.readMany('todos').map(item => item.id)).toEqual([3])
    expect(stack.remote.callCount('deleteMany')).toBe(0)
    expect(stack.store.$mutationHistory).toContainEqual({
      operation: 'delete',
      collection: stack.collection('todos'),
      keys: [1, 2],
      payload: undefined,
    })
  })

  it('caches the items a before hook substituted in many mode', async () => {
    const stack = await setupWithHooks((hook) => {
      hook('beforeManyMutation', ({ setItems }: any) => {
        setItems([{ id: 1, name: 'Changed by before hook' }])
      })
    })

    const result = await stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'update',
      items: [{ id: 1, name: 'Original' }],
    }, ({ items }: any) => items.map((entry: any) => ({ ...(entry.item ?? entry), saved: true })))

    expect(result).toEqual([{ id: 1, name: 'Changed by before hook', saved: true }])
    // The substituted item, not the one `$mutate` was called with, is cached.
    expect(stack.read('todos', 1)).toMatchObject({ id: 1, name: 'Changed by before hook', saved: true })
  })

  it('runs the after hook and records history but writes nothing with skipCache', async () => {
    let afterMutationRan = false
    const stack = await setupWithHooks((hook) => {
      hook('afterMutation', () => {
        afterMutationRan = true
      })
    })

    const result = await stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'create',
      skipCache: true,
    }, () => ({ id: 1, name: 'Skipped' }))

    expect(result).toEqual({ id: 1, name: 'Skipped' })
    expect(afterMutationRan).toBe(true)
    // The distinction a spy cannot make: `skipCache` did nothing to the cache,
    // as opposed to the mutation silently doing nothing at all.
    expect(stack.read('todos', 1)).toBeUndefined()
    expect(stack.store.$mutationHistory).toContainEqual({
      operation: 'create',
      collection: stack.collection('todos'),
      key: 1,
      payload: undefined,
    })
  })

  it('leaves the cache and the history untouched when the callback throws', async () => {
    let afterMutationRan = false
    const stack = await setupWithHooks((hook) => {
      hook('afterMutation', () => {
        afterMutationRan = true
      })
    })
    seedCache(stack, { id: 1, title: 'Untouched' })

    await expect(stack.store.$mutate({
      collection: stack.collection('todos'),
      mutation: 'create',
    }, async () => {
      throw new Error('custom failed')
    })).rejects.toThrow('custom failed')

    expect(afterMutationRan).toBe(false)
    expect(stack.read('todos', 1)).toMatchObject({ id: 1, title: 'Untouched' })
    expect(stack.store.$mutationHistory).toEqual([])
  })
})
