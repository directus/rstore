import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real live-query scopes and collection APIs run against the shared fake backend.
// Old callbacks must not retarget a new owner: options, scope and collection
// changes make them inert while the current subscription keeps working.
describe('live subscription callbacks act only for their current owner', () => {
  it('ignores stale refresh options while current subscription can still refresh', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const title = ref('One')
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      fetchPolicy: 'no-cache',
      params: { where: { title: title.value } },
    })))
    const original = await subscription(payloads)
    title.value = 'Two'
    await vi.waitFor(() => expect(query.data.value).toEqual([{ id: '2', title: 'Two' }]))
    const current = await subscription(payloads, 1)

    await original.refresh!({ params: { where: { title: 'One' } } })
    expect(query.data.value).toEqual([{ id: '2', title: 'Two' }])
    expect(remote.callCount('fetchMany')).toBe(2)
    await current.refresh!({ params: { where: { title: 'One' } } })
    expect(query.data.value).toEqual([{ id: '1', title: 'One' }])
  })

  it('ignores refresh after the owning query scope stops', async () => {
    const { store, scope, remote, payloads } = await setupLiveTodos()
    const owner = scope(() => store.todos.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const query = await owner.result
    const original = await subscription(payloads)
    owner.stop()
    await vi.waitFor(() => expect(remote.subscriptions()).toEqual([]))

    remote.seed('todos', [{ id: '2', title: 'Changed' }])
    await original.refresh!()
    expect(remote.callCount('fetchMany')).toBe(1)
    expect(query.data.value).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
  })

  it.each(['setResult', 'refresh'] as const)('rejects old collection %s before deferred invalidation', async (callback) => {
    const { store, run, remote, payloads } = await setupLiveTodos({
      schema: [{ name: 'todos' }, { name: 'notes' }],
      data: { todos: [{ id: '1', title: 'Todo' }], notes: [{ id: '1', title: 'Note' }] },
    })
    const name = ref('todos')
    const api = run(() => store.$collection(name))
    const query = await run(() => api.liveQuery((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    const original = await subscription(payloads)

    name.value = 'notes'
    if (callback === 'setResult') {
      expect(original.setResult!([{ id: '1', title: 'Wrong collection' }])).toBe('inactive')
    }
    else {
      const refreshing = original.refresh!({ params: { where: { title: 'Missing' } } })
      expect(query.mainPage.options).toEqual({})
      await refreshing
    }
    await vi.waitFor(() => expect(query.data.value).toEqual([{ id: '1', title: 'Note' }]))
    const current = await subscription(payloads, 1)
    expect(current.setResult!([{ id: '1', title: 'Current note' }])).toBe('applied')
    expect(query.data.value).toEqual([{ id: '1', title: 'Current note' }])
    expect(remote.requests('fetchMany').map(call => call.collection)).toEqual(['todos', 'notes'])
  })
})
