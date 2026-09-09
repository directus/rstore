import type { CoreStack } from '#test-utils/store/coreStack'
import { createCoreStack } from '#test-utils/store/coreStack'
import { updateItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

// `packages/vue/test/integration/optimistic.spec.ts` drives the same layers
// from the Vue query API. This file drives them from core, with nothing
// between the mutation and the cache, so what is asserted is the layer overlay
// itself: which value a read sees, under which key, and when the layer is gone.

/** Core store holding one cached todo, with optional extra plugins. */
async function setup(plugins: any[] = []) {
  const stack = await createCoreStack({
    schema: [{ name: 'todos' }],
    plugins,
    data: { todos: [{ id: '1', title: 'One', done: false }] },
  })
  stack.cache.writeItem({
    collection: stack.collection('todos'),
    key: '1',
    item: { id: '1', title: 'One', done: false },
  })
  return stack
}

/** Title currently visible for todo `1` through a public cache read. */
function title(stack: CoreStack) {
  return stack.read('todos', '1')?.title
}

describe('optimistic overrides', () => {
  it('shows the override object rather than the input item', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('updateItem')

    const promise = updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Input' } as any,
      optimistic: { title: 'Override' } as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(1))

    expect(title(stack)).toBe('Override')

    release()
    await promise
    expect(title(stack)).toBe('Input')
  })

  it('files the layer under the mutation key even when the item carries another id', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('updateItem')

    const promise = updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      // A payload whose `id` disagrees with the mutation key: only the
      // `$overrideKey` written by `update.ts` keeps the layered item
      // addressable under `1`.
      item: { id: 'other', title: 'Renamed' } as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(1))

    const optimistic = stack.read('todos', '1')!
    expect(optimistic.title).toBe('Renamed')
    expect(optimistic.$getKey()).toBe('1')

    release()
    await promise
  })
})

describe('layer removal ordering', () => {
  it('removes the layer before the real write, so no read sees both', async () => {
    const seen: Array<string | undefined> = []
    // Filled once the store exists, so the cache seeding inside `setup` — which
    // also emits `afterCacheWrite` — is not recorded.
    const observed: { stack?: CoreStack } = {}
    const stack = await setup([{
      name: 'sync-reader',
      setup({ hook }: any) {
        // `afterCacheWrite` runs synchronously inside the cache write, so this
        // is the only moment an intermediate state could be observed.
        hook('afterCacheWrite', ({ operation }: any) => {
          if (observed.stack && operation === 'write') {
            seen.push(title(observed.stack))
          }
        })
      },
    }])
    observed.stack = stack
    stack.remote.respondNext('updateItem', () => ({ id: '1', title: 'Server' }))

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Optimistic' } as any,
    })

    // `onBeforeApplyCache: removeOptimisticLayer` (update.ts) is what makes the
    // write observable as the server value; a post-write removal would leave
    // the layer overlaying 'Optimistic' here.
    expect(seen).toEqual(['Server'])
    expect(title(stack)).toBe('Server')
  })
})

describe('failure path', () => {
  it('removes the layer and rethrows the original error', async () => {
    const stack = await setup()
    const failure = new Error('backend refused')
    stack.remote.failNext('updateItem', failure)

    const caught = await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Doomed' } as any,
    }).catch((error: unknown) => error)

    // The same error instance, not one wrapped by the mutation path.
    expect(caught).toBe(failure)
    expect(title(stack)).toBe('One')
  })
})

describe('concurrent optimistic updates', () => {
  it('stacks two layers on the same item and unwinds them in order', async () => {
    const stack = await setup()
    const collection = stack.collection('todos')

    const releaseFirst = stack.remote.holdNext('updateItem')
    const first = updateItem({ store: stack.store, collection, key: '1', item: { title: 'A' } as any })
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(1))

    const releaseSecond = stack.remote.holdNext('updateItem')
    const second = updateItem({ store: stack.store, collection, key: '1', item: { title: 'B' } as any })
    await vi.waitFor(() => expect(stack.remote.callCount('updateItem')).toBe(2))

    // The newest layer wins the read while both are live.
    expect(title(stack)).toBe('B')

    releaseFirst()
    await first
    // The first layer is gone and its value is in the base state, but the
    // second layer still sits on top of it.
    expect(stack.remote.rows('todos')[0]!.title).toBe('A')
    expect(title(stack)).toBe('B')

    releaseSecond()
    await second
    expect(stack.remote.rows('todos')[0]!.title).toBe('B')
    expect(title(stack)).toBe('B')
  })
})
