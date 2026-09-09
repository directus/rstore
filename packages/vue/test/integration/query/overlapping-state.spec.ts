import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, ref } from 'vue'

describe.each(['foreground', 'background'] as const)('overlapping %s state', (lane) => {
  it.each([false, true])('completes after a superseded request settles last (latest fails: %s)', async (fails) => {
    const stack = await createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'Current' }] } })
    const generation = ref('old')
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => errors.mockRestore())
    const query = stack.run(() => stack.store.todos.query((q: any) => q.many({
      dedupe: false,
      params: { generation: generation.value },
      fetchPolicy: lane === 'foreground' ? 'no-cache' : 'cache-and-fetch',
    })))
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(1))
    if (fails) {
      stack.remote.failNext('fetchMany', new Error('latest failed'))
    }
    generation.value = 'new'
    await nextTick()
    await vi.waitFor(() => {
      expect(stack.remote.callCount('fetchMany')).toBe(2)
      if (fails) {
        expect(query[lane].error.value?.message).toBe('latest failed')
      }
      else {
        expect(query[lane].lastUpdated.value).toEqual(expect.any(Number))
      }
    })
    const timestamp = query[lane].lastUpdated.value
    expect(query[lane].loading.value).toBe(true)
    expect(query[lane].completed.value).toBe(false)
    release()
    await query
    await query[lane].promise
    expect(query[lane].loading.value).toBe(false)
    expect(query[lane].completed.value).toBe(true)
    expect(query.mainPage[lane].completed).toBe(true)
    expect(query[lane].lastUpdated.value).toBe(timestamp)
    expect(query[lane].error.value?.message ?? null).toBe(fails ? 'latest failed' : null)
  })
})

describe('overlapping indexed page loads', () => {
  it.each(['fetch-only', 'no-cache'] as const)('keeps the latest fetchMore outcome using %s', async (fetchPolicy) => {
    const stack = await createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'Current' }] } })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy,
      dedupe: false,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    stack.remote.respondNext('fetchMany', () => [{ id: '1', title: 'Stale' }])
    const older = query.fetchMore({ pageIndex: 1 })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(2))
    const { page } = await query.fetchMore({ pageIndex: 1 })
    expect(page.data[0].title).toBe('Current')
    const updated = page.foreground.lastUpdated
    release()
    await older
    await query.foreground.promise
    expect(page.data[0].title).toBe('Current')
    expect(page.foreground.lastUpdated).toBe(updated)
    expect(page.foreground.completed).toBe(true)
    expect(page.foreground.loading).toBe(false)
    expect(page.error).toBeNull()
    if (fetchPolicy !== 'no-cache') {
      stack.cache.garbageCollect()
      expect(stack.read('todos', '1')?.title).toBe('Current')
      expect(page.data[0].title).toBe('Current')
    }
  })

  it('keeps a newer page failure when an older fetchMore succeeds', async () => {
    const stack = await createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'Initial' }] } })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy: 'fetch-only',
      dedupe: false,
      resultMode: 'responseRefs',
    })))
    await query.fetchMore({ pageIndex: 1 })
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    stack.remote.respondNext('fetchMany', () => [{ id: '1', title: 'Stale' }])
    const older = query.fetchMore({ pageIndex: 1 })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(3))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => errors.mockRestore())
    const error = new Error('latest failed')
    stack.remote.failNext('fetchMany', error)
    const { page } = await query.fetchMore({ pageIndex: 1 })
    const updated = page.foreground.lastUpdated
    release()
    await older
    expect(page.data[0].title).toBe('Initial')
    expect(page.error).toBe(error)
    expect(page.foreground.lastUpdated).toBe(updated)
    expect(page.foreground.completed).toBe(true)
    expect(page.loading).toBe(false)
    await query.fetchMore({ pageIndex: 1 })
    expect(page.error).toBeNull()
    expect(page.data[0].title).toBe('Initial')
  })

  it('publishes the shared response when a newer fetchMore joins the same request', async () => {
    const stack = await createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'Shared' }] } })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only', resultMode: 'responseRefs' })))
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const first = query.fetchMore({ pageIndex: 1 })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(2))
    const second = query.fetchMore({ pageIndex: 1 })
    await nextTick()
    release()
    const [, { page }] = await Promise.all([first, second])
    expect(stack.remote.callCount('fetchMany')).toBe(2)
    expect(page.data[0].title).toBe('Shared')
    expect(page.foreground.completed).toBe(true)
    expect(page.loading).toBe(false)
  })
})
