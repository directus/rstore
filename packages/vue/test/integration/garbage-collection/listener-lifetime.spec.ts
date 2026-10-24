import type { VueStackOptions } from '#test-utils/store/vueStack'
import type { Ref } from 'vue'
import { expectReleased } from '#test-utils/gc'
import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { realtimeReconnectEventHook } from '../../../src'
import { createGarbageCollectionStack, todoSchema } from './utils'

/**
 * Create a stack the test disposes itself: auto-dispose would keep the store
 * reachable through `onTestFinished` until the test ends.
 */
function createStack(options: Partial<VueStackOptions> = {}) {
  return createGarbageCollectionStack({
    schema: todoSchema,
    data: { todos: [{ id: '1', title: 'One' }] },
    autoDispose: false,
    ...options,
  })
}

describe('module-level and reactive listener memory', () => {
  // Unmount must not re-run the options getter: state it reads can already be
  // gone, and a throw would skip every later cleanup of the scope.
  it('unmounts cleanly when its options getter can no longer run', async () => {
    const stack = await createStack()
    const user = ref<{ id: string } | null>({ id: '1' })
    const mounted = stack.scope(() => stack.store.todos.liveQuery((q: any) => q.first(user.value!.id)))
    await mounted.result
    const fetches = stack.remote.callCount('fetchFirst')

    user.value = null
    expect(() => mounted.stop()).not.toThrow()

    realtimeReconnectEventHook.trigger()
    expect(stack.remote.callCount('fetchFirst')).toBe(fetches)
    stack.dispose()
  })

  it('releases a server store rendered with window focus refresh', async () => {
    /** Render once like an SSR request, whose component scopes never stop. */
    async function render(): Promise<WeakRef<object>> {
      const stack = await createStack({ isServer: true })
      try {
        await effectScope(true).run(() => stack.store.todos.query((q: any) => q.many({
          fetchOptions: { autoRefresh: 'windowFocus' },
        })))
        return new WeakRef(stack.store)
      }
      finally {
        stack.dispose()
      }
    }

    await expectReleased(await render())
  })

  it('releases a store whose live query was created outside any effect scope', async () => {
    /** Create the query the way a plugin or code after an `await` does. */
    async function run(): Promise<WeakRef<object>> {
      const stack = await createStack()
      try {
        await stack.store.todos.liveQuery((q: any) => q.many())
        return new WeakRef(stack.store)
      }
      finally {
        stack.dispose()
      }
    }

    await expectReleased(await run())
  })

  // Long-lived reactive state (a route, a global store) outlives the store:
  // its watchers must not keep a scope-less query or subscription alive.
  it.each([
    ['query', (store: any, key: Ref<string>) => store.todos.query((q: any) => q.first(key.value))],
    ['liveQuery', (store: any, key: Ref<string>) => store.todos.liveQuery((q: any) => q.first(key.value))],
    ['subscribe', (store: any, key: Ref<string>) => store.todos.subscribe((s: any) => s(key.value))],
  ])('releases a store whose scope-less %s follows long-lived reactive options', async (_name, start) => {
    const key = ref('1')

    /** Start the consumer without a scope, then dispose the store. */
    async function run(): Promise<WeakRef<object>> {
      const stack = await createStack()
      try {
        await start(stack.store, key)
        return new WeakRef(stack.store)
      }
      finally {
        stack.dispose()
      }
    }

    await expectReleased(await run())
    // Keep the reactive source alive past the check.
    expect(key.value).toBe('1')
  })

  // Code resuming after an `await` can still start a query once the app (and
  // its store) is gone: the store's disposal already ran and never runs again.
  it.each([true, false])('releases at once a listener of a live query created after its store was disposed (earlier query: %s)', async (earlierQuery) => {
    const stack = await createStack()
    if (earlierQuery) {
      const mounted = stack.scope(() => stack.store.todos.liveQuery((q: any) => q.many()))
      await mounted.result
      mounted.stop()
    }
    stack.dispose()

    await stack.store.todos.liveQuery((q: any) => q.many())
    const fetches = stack.remote.callCount('fetchMany')
    await realtimeReconnectEventHook.trigger()
    expect(stack.remote.callCount('fetchMany')).toBe(fetches)
  })

  it('releases an unsubscribed subscription created outside any effect scope', async () => {
    const stack = await createGarbageCollectionStack({ schema: todoSchema })
    // Long-lived reactive state (a route, a global store) keeps its watchers.
    const key = ref('1')

    /** Subscribe and unsubscribe without a scope, keeping only the metadata handle. */
    async function run(): Promise<WeakRef<object>> {
      const { unsubscribe, meta } = stack.store.todos.subscribe((s: any) => s(key.value))
      await unsubscribe()
      return new WeakRef(meta)
    }

    await expectReleased(await run())
  })
})
