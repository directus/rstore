import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

// Native focus, reactive modes and multiple consumers live in test/browser/focus.spec.ts.
// A browser context owns its Window global; replacing that global inside one JS realm
// is a test-double capability, not a supported application browsing-context transition.
describe('window focus auto refresh during server rendering', () => {
  it('loads a many query without requiring a browser window', async () => {
    const stack = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })

    expect(typeof window).toBe('undefined')
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      fetchOptions: { autoRefresh: 'windowFocus' },
    })))

    expect(query.data.value.map((row: any) => ({ id: row.id, title: row.title }))).toEqual([{ id: '1', title: 'One' }])
    expect(query.error.value).toBeNull()
    expect(query.loading.value).toBe(false)
    expect(stack.remote.callCount('fetchMany', 'todos')).toBe(1)
  })
})
