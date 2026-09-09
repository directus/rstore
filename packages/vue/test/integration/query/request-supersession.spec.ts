import { createVueStack } from '#test-utils/store/vueStack'
import { cacheWriteEventHook } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, ref } from 'vue'

/** One shared cache identity with visibly different response generations. */
function setup() {
  return createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'Initial' }] } })
}

describe.each(['first', 'many'] as const)('%s query response supersession', (method) => {
  it.each(['computed', 'responseRefs'] as const)('keeps current fields after an older %s response arrives', async (resultMode) => {
    const stack = await setup()
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const query = await stack.run(() => stack.store.todos.query((q: any) => q[method]({
      key: method === 'first' ? '1' : undefined,
      dedupe: false,
      resultMode,
      experimentalGarbageCollection: true,
    })))
    /** Read the consumer value through either public query shape. */
    const title = () => (method === 'first' ? query.data.value : query.data.value[0])?.title
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    stack.remote.respondNext(hook, () => method === 'first' ? { id: '1', title: 'Stale' } : [{ id: '1', title: 'Stale' }])
    const older = query.refresh()
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(2))
    stack.remote.seed('todos', [{ id: '1', title: 'Current' }])
    await query.refresh()
    expect(title()).toBe('Current')
    release()
    await older
    await nextTick()
    expect(title()).toBe('Current')
    expect(stack.read('todos', '1')?.title).toBe('Current')
    stack.cache.garbageCollect()
    expect(title()).toBe('Current')
  })

  it('does not publish a background response superseded by reactive options', async () => {
    const stack = await setup()
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const generation = ref('old')
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    stack.remote.respondNext(hook, () => method === 'first' ? { id: '1', title: 'Stale' } : [{ id: '1', title: 'Stale' }])
    const query = await stack.run(() => stack.store.todos.query((q: any) => q[method]({
      key: method === 'first' ? '1' : undefined,
      params: { generation: generation.value },
      fetchPolicy: 'cache-and-fetch',
      resultMode: 'responseRefs',
    })))
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    generation.value = 'new'
    stack.remote.seed('todos', [{ id: '1', title: 'Current' }])
    await vi.waitFor(() => expect(stack.read('todos', '1')?.title).toBe('Current'))
    release()
    await query.background.promise
    expect(stack.read('todos', '1')?.title).toBe('Current')
    expect((method === 'first' ? query.data.value : query.data.value[0])?.title).toBe('Current')
  })

  it.each(['query', 'direct'] as const)('keeps a deduped response needed by another %s consumer', async (consumer) => {
    const stack = await setup()
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const options = { key: method === 'first' ? '1' : undefined, fetchPolicy: 'fetch-only', resultMode: 'computed' }
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    const first = stack.scope(() => stack.store.todos.query((q: any) => q[method](options)))
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    const second = consumer === 'query'
      ? stack.run(() => stack.store.todos.query((q: any) => q[method](options)))
      : stack.store.todos[method === 'first' ? 'findFirst' : 'findMany'](options)
    await nextTick()
    first.stop()
    release()
    const [, result] = await Promise.all([first.result, second])
    expect(stack.remote.callCount(hook)).toBe(1)
    expect(stack.read('todos', '1')?.title).toBe('Initial')
    const data = consumer === 'query' ? result.data.value : result
    expect((method === 'first' ? data : data[0])?.title).toBe('Initial')
  })

  it('discards a queued cache write after its query is superseded', async () => {
    const stack = await setup()
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const query = await stack.run(() => stack.store.todos.query((q: any) => q[method]({
      key: method === 'first' ? '1' : undefined,
      dedupe: false,
    })))
    const notifications: unknown[] = []
    const { off } = cacheWriteEventHook.on((event) => {
      if (event.collection === stack.collection('todos')) {
        notifications.push(event)
      }
    })
    onTestFinished(off)
    stack.cache.pause()
    stack.remote.seed('todos', [{ id: '1', title: 'Queued stale value' }])
    await query.refresh()
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    stack.remote.seed('todos', [{ id: '1', title: 'Current' }])
    const latest = query.refresh()
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(3))
    stack.cache.resume()
    expect(stack.read('todos', '1')?.title).toBe('Initial')
    expect(notifications).toEqual([])
    release()
    await latest
    expect(stack.read('todos', '1')?.title).toBe('Current')
    expect(notifications).toHaveLength(1)
  })

  it('allows response metadata to be reused by a later mutation', async () => {
    const stack = await setup()
    const query = await stack.run(() => stack.store.todos.query((q: any) => q[method]({
      key: method === 'first' ? '1' : undefined,
      meta: { source: 'editor' },
    })))
    const meta = query.meta.value
    await query.refresh()
    await stack.store.todos.update({ id: '1', title: 'Edited' }, { meta })
    expect(meta.source).toBe('editor')
    expect(stack.read('todos', '1')?.title).toBe('Edited')
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Edited' }])
  })
})
