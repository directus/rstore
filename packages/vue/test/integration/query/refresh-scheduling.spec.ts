import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { ref } from 'vue'

/** Return a response whose value identifies request's reactive workspace. */
function workspaceResponse(workspace: string, many: boolean) {
  const item = { id: workspace, title: workspace }
  return many ? [item] : item
}

/** Read first visible title from either public query result shape. */
function title(query: any, method: 'first' | 'many') {
  return (method === 'first' ? query.data.value : query.data.value[0])?.title
}

describe.each(['first', 'many'] as const)('%s refresh scheduling', (method) => {
  const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'

  /** Create a query whose response identifies its current reactive workspace. */
  async function setup(fetchPolicy = 'fetch-only') {
    const workspace = ref('a')
    const stack = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [] },
      on: {
        [hook]: (ctx: any) => workspaceResponse(ctx.payload.findOptions.params.workspace, method === 'many'),
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q[method]({
      key: method === 'first' ? 'a' : undefined,
      dedupe: false,
      fetchPolicy,
      params: { workspace: workspace.value },
      resultMode: 'responseRefs',
    })))
    return { stack, workspace, query }
  }

  it.each(['fetch-only', 'cache-first'] as const)('returns the changed query result from an immediate %s refresh without scheduling it twice', async (fetchPolicy) => {
    const { query, stack, workspace } = await setup(fetchPolicy)
    expect(title(query, method)).toBe('a')

    workspace.value = 'b'
    await query.refresh()

    expect(title(query, method)).toBe('b')
    // `dedupe: false` makes this a scheduling assertion rather than a shared-request side effect.
    expect(stack.remote.callCount(hook, 'todos')).toBe(2)
  })

  it('lets a later reactive change supersede an in-flight refresh', async () => {
    const { query, stack, workspace } = await setup()
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    stack.remote.respondNext(hook, () => workspaceResponse('b', method === 'many'))

    workspace.value = 'b'
    const refreshing = query.refresh()
    await vi.waitFor(() => expect(stack.remote.callCount(hook, 'todos')).toBe(2))

    workspace.value = 'c'
    await vi.waitFor(() => expect(stack.remote.callCount(hook, 'todos')).toBe(3))
    expect(title(query, method)).toBe('c')

    release()
    await refreshing
    expect(title(query, method)).toBe('c')
    expect(stack.remote.callCount(hook, 'todos')).toBe(3)
  })

  it.each(['cache-first', 'no-cache'] as const)('keeps its foreground error when a %s refresh fails', async (fetchPolicy) => {
    const { query, stack, workspace } = await setup(fetchPolicy)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => errors.mockRestore())
    const failure = new Error('workspace fetch failed')
    stack.remote.failNext(hook, failure)

    workspace.value = 'b'
    await query.refresh()

    expect(query.foreground.error.value).toBe(failure)
    expect(title(query, method)).toBe('a')
    expect(stack.remote.callCount(hook, 'todos')).toBe(2)
  })
})

describe('refresh scheduling pagination', () => {
  it('drops pages owned by a previous query when immediate refresh consumes changed options', async () => {
    const workspace = ref('a')
    const stack = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [] },
      on: {
        fetchMany: (ctx: any) => [{
          id: `${ctx.payload.findOptions.params.workspace}-${ctx.payload.findOptions.pageIndex ?? 0}`,
          title: `${ctx.payload.findOptions.params.workspace}-${ctx.payload.findOptions.pageIndex ?? 0}`,
        }],
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      dedupe: false,
      fetchPolicy: 'fetch-only',
      params: { workspace: workspace.value },
      resultMode: 'responseRefs',
    })))
    await query.fetchMore({ pageIndex: 1 })
    expect(query.data.value.map((item: any) => item.title)).toEqual(['a-0', 'a-1'])

    workspace.value = 'b'
    await query.refresh()

    expect(query.data.value.map((item: any) => item.title)).toEqual(['b-0'])
    expect(query.pages.value[1]).toBeUndefined()
  })

  it('leaves a pending option change for the watcher when refreshing excludes the main page', async () => {
    const workspace = ref('a')
    const stack = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [] },
      on: {
        fetchMany: (ctx: any) => workspaceResponse(ctx.payload.findOptions.params.workspace, true),
      },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      dedupe: false,
      fetchPolicy: 'fetch-only',
      params: { workspace: workspace.value },
      resultMode: 'responseRefs',
    })))
    const calls = stack.remote.callCount('fetchMany', 'todos')

    workspace.value = 'b'
    await query.refresh({ pages: [] })
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany', 'todos')).toBe(calls + 1))

    expect(title(query, 'many')).toBe('b')
  })
})
