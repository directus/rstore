import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds, todoSchema } from './utils'

describe('query ownership lifecycle', () => {
  it('filters a row before deferred collection when a successful main-page refresh drops it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh()
    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
  })

  it('keeps a retained row readable and non-collectible', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))

    stack.cache.garbageCollect()
    await drainGarbageCollection()

    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
  })

  it('keeps a shared row after one query releases it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1', done: false }, { id: '2', done: false }] },
    })
    const filtered = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      params: { where: { done: false } },
      experimentalGarbageCollection: true,
    })))
    const all = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    stack.remote.seed('todos', [{ id: '1', done: false }, { id: '2', done: true }])

    await filtered.refresh()
    await drainGarbageCollection()
    expect(queryIds(filtered)).toEqual(['1'])
    expect(queryIds(all)).toEqual(['1', '2'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
  })

  it('collects a row exactly once after its final query owner releases it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const collected: any[] = []
    stack.store.$hooks.hook('itemGarbageCollect', (payload: any) => collected.push(payload))
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    stack.cache.garbageCollect()
    expect(collected.map((payload: any) => payload.key)).toEqual(['2'])
  })

  it('keeps rendered data and ownership after a failed refresh', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const events: any[] = []
    stack.store.$hooks.hook('itemGarbageCollect', (payload: any) => events.push(payload))
    stack.remote.failNext('fetchMany')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await query.refresh()
    error.mockRestore()
    await drainGarbageCollection()
    expect(queryIds(query)).toEqual(['1', '2'])
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(events).toEqual([])
  })

  it('does not acquire ownership while disabled, then acquires it after re-enable', async () => {
    const enabled = ref(false)
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      enabled: enabled.value,
      experimentalGarbageCollection: true,
    })))
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeUndefined()

    stack.remote.seed('todos', [{ id: '1' }])
    enabled.value = true
    await vi.waitFor(() => expect(queryIds(query)).toEqual(['1']))
    await nextTick()
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeDefined()
  })

  it('releases a prior first-query key after a reactive key replacement succeeds', async () => {
    const key = ref('1')
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.first({
      key: key.value,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const fetches = stack.remote.callCount('fetchFirst', 'todos')

    key.value = '2'
    await vi.waitFor(() => expect(query.data.value?.id).toBe('2'))
    await drainGarbageCollection()

    expect(cached(stack, 'todos', '1')).toBeUndefined()
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(fetches + 1)
  })

  it('replaces a first-query result with null and collects its prior row', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.first({
      key: '1',
      experimentalGarbageCollection: true,
    })))
    const fetches = stack.remote.callCount('fetchFirst', 'todos')
    stack.remote.seed('todos', [])

    await query.refresh()
    await drainGarbageCollection()

    expect(query.data.value).toBeNull()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    expect(stack.remote.callCount('fetchFirst', 'todos')).toBe(fetches + 1)
  })

  it('ignores a superseded late result without releasing current ownership', async () => {
    let mode: 'initial' | 'stale' | 'current' = 'initial'
    let releaseStale: (() => void) | undefined
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      on: {
        fetchMany: () => {
          if (mode === 'stale') {
            return new Promise((resolve) => {
              releaseStale = () => {
                resolve([{ id: '2' }])
              }
            })
          }
          return mode === 'initial' ? [{ id: '1' }, { id: '2' }] : [{ id: '1' }]
        },
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      dedupe: false,
      experimentalGarbageCollection: true,
    })))
    mode = 'stale'
    const stale = query.refresh()
    await vi.waitFor(() => expect(releaseStale).toBeTypeOf('function'))
    mode = 'current'

    await query.refresh()
    releaseStale!()
    await stale
    await drainGarbageCollection()

    expect(queryIds(query)).toEqual(['1'])
    expect(cached(stack, 'todos', '1')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(3)
  })

  it('releases shared rows only after the second owning scope disposes', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }] },
    })
    const first = stack.scope(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    const second = stack.scope(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    await Promise.all([first.result, second.result])

    first.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '1')).toBeDefined()
    second.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
  })

  it('collects on single-scope disposal and emits one hook per released row', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const mounted = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const query = await mounted.result
    expect(queryIds(query)).toEqual(['1', '2'])
    const collected: any[] = []
    stack.store.$hooks.hook('itemGarbageCollect', (payload: any) => collected.push(payload))

    mounted.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(collected.map((payload: any) => payload.key).sort()).toEqual(['1', '2'])
  })

  it('refetches authoritative rows on same-option remount after disposal', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const mounted = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const query = await mounted.result
    expect(queryIds(query)).toEqual(['1', '2'])
    const fetches = stack.remote.callCount('fetchMany', 'todos')

    mounted.stop()
    await drainGarbageCollection()
    const remount = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    expect(queryIds(await remount.result)).toEqual(['1', '2'])
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })
})
