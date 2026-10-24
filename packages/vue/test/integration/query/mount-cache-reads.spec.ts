import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'

// Mounting a query whose result never comes from a cache read must not scan
// the cache: `beforeCacheReadMany` plugins, the user filter and
// `cacheFilterMany` would otherwise run on every mount, SSR included.
describe('query mount cache reads', () => {
  it.each([
    { fetchPolicy: 'no-cache' },
    { resultMode: 'responseRefs' },
  ])('skips cache reads when mounting a list query with %o', async (options) => {
    const stack = await createVueStack({ schema: [{ name: 'todos' }], data: { todos: [{ id: '1', title: 'One' }] } })
    const beforeCacheReadMany = vi.fn()
    stack.store.$hooks.hook('beforeCacheReadMany', beforeCacheReadMany)

    stack.scope(() => stack.store.todos.query((q: any) => q.many(options)))

    expect(beforeCacheReadMany).not.toHaveBeenCalled()
  })
})
