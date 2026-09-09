import type { VueStack } from '#test-utils/store/vueStack'
import type { WindowStub } from '#test-utils/store/windowStub'
import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { stubWindow } from '#test-utils/store/windowStub'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

// `packages/vue/src/swr.ts` had zero coverage although it holds module-level
// listener state (`windowFocusTarget`) shared by every query in the app — the
// kind of state that leaks across route changes and keeps refreshing queries
// nobody is displaying anymore. Assertions are request counts, because "did
// this event cause a fetch" is exactly what the feature is.

const windowStubs: WindowStub[] = []

afterEach(() => {
  // The query scopes holding the `onWindowFocus` handles are stopped by the
  // stack itself; only the globals have to be put back by hand.
  windowStubs.splice(0).forEach(stub => stub.restore())
})

const schema: StoreSchema = [{ name: 'todos' }, { name: 'notes' }]

/** Store backed by a scripted fake remote, with two collections. */
function setup() {
  return createVueStack({
    schema,
    data: {
      todos: [{ id: '1', title: 'One' }],
      notes: [{ id: 'n1', body: 'Note' }],
    },
  })
}

/** Installs a `window` stub that is restored after the test. */
function installWindow() {
  const stub = stubWindow()
  windowStubs.push(stub)
  return stub
}

/**
 * Opens a query in its own scope, the way a component would.
 *
 * @param stack The stack whose store is queried.
 * @param collection Collection name to query.
 * @param autoRefresh Auto refresh mode, reactive or not.
 */
async function openQuery(stack: VueStack, collection: string, autoRefresh: any) {
  const { result, stop } = stack.scope(() => stack.store[collection].query((q: any) => q.many({
    fetchOptions: { autoRefresh: typeof autoRefresh === 'function' ? autoRefresh() : autoRefresh },
  })))
  return { query: await result, stop }
}

/** Drains the promise and Vue queues used by a synchronously dispatched event. */
async function drainEventLoop() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('window focus auto refresh', () => {
  it('refreshes on a focus event, and only with autoRefresh: windowFocus', async () => {
    const stub = installWindow()
    const stack = await setup()
    await openQuery(stack, 'todos', 'windowFocus')
    await openQuery(stack, 'notes', 'manual')
    const todos = stack.remote.callCount('fetchMany', 'todos')
    const notes = stack.remote.callCount('fetchMany', 'notes')

    stub.dispatch('focus')

    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos + 1))
    expect(stack.remote.callCount('fetchMany', 'notes')).toBe(notes)
  })

  it('detaches the listener when the reactive option switches to manual', async () => {
    const stub = installWindow()
    const stack = await setup()
    const mode = ref<'windowFocus' | 'manual'>('windowFocus')
    await openQuery(stack, 'todos', () => mode.value)

    mode.value = 'manual'
    await nextTick()
    await drainEventLoop()
    const todos = stack.remote.callCount('fetchMany', 'todos')

    stub.dispatch('focus')
    await drainEventLoop()

    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos)
  })

  it('detaches the listener when the owning scope is disposed', async () => {
    const stub = installWindow()
    const stack = await setup()
    const { stop } = await openQuery(stack, 'todos', 'windowFocus')
    const todos = stack.remote.callCount('fetchMany', 'todos')

    stop()
    stub.dispatch('focus')
    await drainEventLoop()

    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos)
  })

  it('shares one listener between queries and keeps the others working when one is disposed', async () => {
    const stub = installWindow()
    const stack = await setup()
    const first = await openQuery(stack, 'todos', 'windowFocus')
    await openQuery(stack, 'notes', 'windowFocus')
    const todos = stack.remote.callCount('fetchMany', 'todos')
    const notes = stack.remote.callCount('fetchMany', 'notes')

    stub.dispatch('focus')
    await vi.waitFor(() => {
      expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos + 1)
      expect(stack.remote.callCount('fetchMany', 'notes')).toBe(notes + 1)
    })

    first.stop()
    stub.dispatch('focus')

    // The single module-level listener stays attached for the survivor.
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany', 'notes')).toBe(notes + 2))
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos + 1)
  })

  it('rebinds to a replaced window global and drops the previous one', async () => {
    const first = installWindow()
    const stack = await setup()
    await openQuery(stack, 'todos', 'windowFocus')

    // A new `window` — a fresh browsing context, or a test replacing the
    // global: the module must move its listener instead of listening to a
    // window nobody focuses anymore.
    first.restore()
    const second = installWindow()
    await openQuery(stack, 'notes', 'windowFocus')
    const todos = stack.remote.callCount('fetchMany', 'todos')

    second.dispatch('focus')
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos + 1))

    first.dispatch('focus')
    await drainEventLoop()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(todos + 1)
  })

  it('installs no listener when there is no window global', async () => {
    const stack = await setup()

    // Server-side rendering: `window` is undefined and reading it must not
    // throw while the query is created.
    expect(typeof window).toBe('undefined')
    const { query } = await openQuery(stack, 'todos', 'windowFocus')

    expect(query.data.value).toHaveLength(1)
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(1)
  })
})
