import { expectReleased } from '#test-utils/gc'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, watchEffect } from 'vue'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds, todoSchema } from './utils'

describe('ended query memory', () => {
  it.each(['settled', 'retargeted', 'in-flight'])('releases a %s query while a peer keeps shared records alive', async (phase) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1', title: 'Shared' }, { id: '2', title: 'Other' }] },
      experimentalGarbageCollection: true,
    })
    const peer = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
    stack.run(() => watchEffect(() => {
      void peer.data.value[0]?.title
    }))

    /** Keep the ended query out of the test driver's stack during collection. */
    async function visit(): Promise<WeakRef<object>> {
      const key = ref('1')
      const fetches = stack.remote.callCount('fetchFirst')
      const release = phase === 'in-flight' ? stack.remote.holdNext('fetchFirst') : () => {}
      const mounted = stack.scope(() => stack.store.todos.query((q: any) => q.first({
        key: key.value,
        fetchPolicy: 'fetch-only',
      })))
      const ended = new WeakRef<object>(mounted.result.data)
      try {
        if (phase === 'in-flight') {
          await vi.waitFor(() => expect(stack.remote.callCount('fetchFirst')).toBe(fetches + 1))
          mounted.stop()
          release()
        }
        const query = await mounted.result
        if (phase !== 'in-flight')
          expect(query.data.value?.id).toBe('1')
        if (phase === 'retargeted') {
          key.value = '2'
          await nextTick()
          await query.refresh()
          expect(query.data.value?.id).toBe('2')
        }
        return ended
      }
      finally {
        release()
        mounted.stop()
      }
    }

    const ended = await visit()
    await expectReleased(ended)

    stack.cache.garbageCollect()
    expect(queryIds(peer)).toEqual(['1', '2'])
    await peer.refresh()
    expect(peer.data.value.map((item: any) => item.title)).toEqual(['Shared', 'Other'])
  })

  it.each(['refresh', 'peer release'])('releases evicted metadata after %s while its query stays active', async (releaseBy) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
      experimentalGarbageCollection: true,
    })

    /** Drop the stopped peer's result refs before testing metadata collection. */
    async function releaseRow() {
      const peer = releaseBy === 'peer release'
        ? stack.scope(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
        : undefined
      await peer?.result
      const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
      const metadata = new WeakRef<object>(query.data.value[0].$meta)
      stack.remote.seed('todos', [{ id: '2' }])
      await query.refresh()
      peer?.stop()
      await drainGarbageCollection()
      expect(cached(stack, 'todos', '1')).toBeUndefined()
      // Lazy computed output may hold its old rows until the consumer rereads it.
      expect(queryIds(query)).toEqual(['2'])
      return { query, metadata }
    }

    const { query, metadata } = await releaseRow()
    await expectReleased(metadata)
    expect(queryIds(query)).toEqual(['2'])
  })

  it.each(['dispose', 'disable'])('removes current and historical dirty memberships on %s', async (end) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
      experimentalGarbageCollection: true,
    })
    const peer = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
    const sibling = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
    stack.remote.seed('todos', [{ id: '2' }])
    await sibling.refresh()
    const baseline = peer.data.value.map((item: any) => item.$meta.queries.size)
    const dirtyBefore = peer.data.value.map((item: any) => item.$meta.dirtyQueries.size)
    stack.remote.seed('todos', [{ id: '1' }, { id: '2' }])
    const enabled = ref(true)
    const mounted = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy: 'fetch-only',
      experimentalGarbageCollection: enabled.value,
    })))
    const query = await mounted.result
    stack.remote.seed('todos', [{ id: '2' }])
    await query.refresh()
    expect(queryIds(query)).toEqual(['2'])
    expect(cached(stack, 'todos', '1')?.$meta.dirtyQueries.size).toBe(2)

    if (end === 'dispose') {
      mounted.stop()
    }
    else {
      enabled.value = false
      await nextTick()
      await query.refresh()
    }
    await drainGarbageCollection()
    stack.cache.garbageCollect()

    expect(queryIds(peer)).toEqual(['1', '2'])
    expect(peer.data.value.map((item: any) => item.$meta.queries.size)).toEqual(end === 'disable' ? [baseline[0]! + 1, baseline[1]! + 1] : baseline)
    expect(peer.data.value.map((item: any) => item.$meta.dirtyQueries.size)).toEqual(dirtyBefore)
    expect(queryIds(sibling)).toEqual(['2'])
  })
})
