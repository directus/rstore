import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'

/** A shared response carries metadata through the real plugin pipeline. */
async function setup(method: 'first' | 'many') {
  const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
  const stack = await createVueStack({
    schema: [{ name: 'todos' }],
    data: { todos: [{ id: '1', title: 'One' }] },
    on: { [hook]: async (ctx: any) => {
      ctx.payload.meta.total = 42
      return ctx.next()
    } },
  })
  return { hook, stack } as const
}

describe.each(['first', 'many'] as const)('%s deduped response metadata', (method) => {
  it.each(['fetch-only', 'cache-and-fetch'] as const)('reaches both reactive consumers using %s', async (fetchPolicy) => {
    const { hook, stack } = await setup(method)
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    const options = { key: method === 'first' ? '1' : undefined, fetchPolicy, experimentalGarbageCollection: true }
    const first = stack.scope(() => stack.store.todos.query((q: any) => q[method](options)))
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    const second = stack.run(() => stack.store.todos.query((q: any) => q[method](options)))
    await nextTick()
    release()
    const [a, b] = await Promise.all([first.result, second])
    await Promise.all([a.background.promise, b.background.promise])

    expect(stack.remote.callCount(hook)).toBe(1)
    expect(a.meta.value.total).toBe(42)
    expect(b.meta.value.total).toBe(42)
    first.stop()
    await nextTick()
    stack.cache.garbageCollect()
    expect((method === 'first' ? b.data.value : b.data.value[0])?.title).toBe('One')
    // Response metadata must not carry another consumer's publication guard.
    await b.refresh()
    await stack.store.todos.update({ id: '1', title: 'Edited' }, { meta: a.meta.value })
    expect(stack.read('todos', '1')?.title).toBe('Edited')
  })

  it('reaches a reactive consumer joining an imperative fetch', async () => {
    const { hook, stack } = await setup(method)
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    const options = { key: method === 'first' ? '1' : undefined, fetchPolicy: 'fetch-only', resultMode: 'computed' }
    const direct = stack.store.todos[method === 'first' ? 'findFirst' : 'findMany'](options)
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    const query = stack.run(() => stack.store.todos.query((q: any) => q[method](options)))
    await nextTick()
    release()
    await Promise.all([direct, query])

    expect(stack.remote.callCount(hook)).toBe(1)
    expect(query.meta.value.total).toBe(42)
  })
})
