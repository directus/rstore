import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds, todoSchema } from './utils'

describe('garbage collection option resolution', () => {
  it.each(['computed', 'responseRefs'] as const)('retains replacement ownership after a filter-only change using %s', async (resultMode) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1', done: false }] },
    })
    const filter = shallowRef((item: { done: boolean }) => !item.done)
    const scope = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      filter: filter.value,
      fetchPolicy: 'fetch-only',
      resultMode,
      experimentalGarbageCollection: true,
    })))
    const query = await scope.result
    expect(queryIds(query)).toEqual(['1'])

    stack.remote.seed('todos', [{ id: '2', done: true }])
    filter.value = item => item.done
    await nextTick()
    await query.foreground.promise
    await drainGarbageCollection()

    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(2)
    expect(query.error.value).toBeNull()
    expect(queryIds(query)).toEqual(['2'])
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    stack.cache.garbageCollect()
    expect(queryIds(query)).toEqual(['2'])
    expect(cached(stack, 'todos', '2')?.done).toBe(true)

    scope.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
  })

  it.each([
    [false, undefined, 'cache-first', false, false],
    [false, true, 'cache-first', false, true],
    [true, undefined, 'cache-first', false, true],
    [true, false, 'cache-first', false, false],
    [true, true, 'no-cache', false, false],
    [true, undefined, 'cache-first', true, false],
  ])('uses default=%s override=%s policy=%s server=%s', async (storeDefault, queryOverride, fetchPolicy, isServer, retains) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
      experimentalGarbageCollection: storeDefault,
      isServer,
    })
    await stack.run(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy,
      experimentalGarbageCollection: queryOverride,
    })))

    stack.cache.garbageCollect()

    expect(cached(stack, 'todos', '1') != null).toBe(retains)
  })

  it('adopts cached page refs when a reactive override becomes enabled', async () => {
    const enabled = ref(false)
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: enabled.value,
    })))
    expect(cached(stack, 'todos', '1')).toBeDefined()
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    enabled.value = true
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1))
    stack.cache.garbageCollect()

    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
  })

  it('releases ownership without evicting when a reactive override becomes disabled', async () => {
    const enabled = ref(true)
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    await stack.run(() => stack.store.todos.query((q: any) => q.many({
      experimentalGarbageCollection: enabled.value,
    })))

    enabled.value = false
    await nextTick()
    expect(cached(stack, 'todos', '1')).toBeDefined()

    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
  })

  it('keeps the cached lane owned until its cache-and-fetch replacement settles', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const first = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    expect(queryIds(first)).toEqual(['1'])

    const release = stack.remote.holdNext('fetchMany')
    const refreshing = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy: 'cache-and-fetch',
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const query = await refreshing.result
    stack.cache.garbageCollect()

    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    release()
  })
})
