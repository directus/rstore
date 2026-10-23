import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { setupTodos } from '../../utils/live-query'

/** Three seeded rows, so each one-row page holds distinct data. */
const data = { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }, { id: '3', title: 'Three' }] }

/** Real Vue stack with detached remote rows and observable connector callbacks. */
function setup(options: Record<string, any> = {}) {
  return setupTodos({ data, ...options })
}

/** Open a paginated query; no-cache makes independent page publication observable. */
function live(store: any, pages?: any, options: () => Record<string, any> = () => ({})) {
  return store.todos.liveQuery((q: any) => q.many({ pageSize: 1, fetchPolicy: 'no-cache', ...options() }), { pages })
}

/** Wait for exactly the expected active page subscriptions at the remote boundary. */
async function followed(remote: any, indexes: number[]) {
  await vi.waitFor(() => expect(remote.requests('subscribe').filter((sub: any) => remote.subscriptions().includes(sub.subscriptionId)).map((sub: any) => sub.findOptions.pageIndex ?? 0).sort()).toEqual(indexes))
}

// Missing/wrong-page selection fails transport assertions; wrong callback binding
// fails exact page data and request targets. Held work is released even on failure.
describe('live pages follow selected windows without leaking subscriptions', () => {
  it.each([0, 2])('defaults to main page %s and keeps policy out of find options', async (pageIndex) => {
    const { store, run, remote, payloads } = await setup()
    const query = await run(() => live(store, undefined, () => ({ pageIndex })))
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [pageIndex])
    expect(remote.callCount('subscribe')).toBe(1)
    expect(payloads[0]).toMatchObject({ pageIndex, findOptions: { pageSize: 1 } })
    expect(remote.lastRequest('fetchMany')!.findOptions).not.toHaveProperty('pages')
    expect(payloads[0]!.findOptions).not.toHaveProperty('pages')
  })

  it('follows only existing selected pages, switches back, and invalidates old callbacks immediately', async () => {
    const { store, run, remote, payloads } = await setup()
    const current = ref(1)
    const query = await run(() => live(store, () => [current.value, current.value, 9]))
    await nextTick()
    expect(remote.subscriptions()).toEqual([])
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [1])
    const old = payloads[0]!
    expect(old).toMatchObject({ pageIndex: 1, findOptions: { pageIndex: 1 } })
    current.value = 0
    expect(old.setResult!([{ id: '9' }])).toBe('inactive')
    await followed(remote, [0])
    expect(remote.lastRequest('unsubscribe')!.subscriptionId).toBe(old.subscriptionId)
    expect(payloads.at(-1)!.pageIndex).toBe(0)
    expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '2'])
  })

  it('follows all three pages, preserves cursor options, and drops old pages on a base reset', async () => {
    const { store, run, remote, payloads } = await setup()
    const title = ref<string | undefined>()
    const query = await run(() => live(store, 'all', () => ({ params: { where: title.value ? { title: title.value } : {} } })))
    await query.fetchMore({ pageIndex: 1, params: { after: 'first' } })
    await query.fetchMore({ pageIndex: 2, params: { after: 'second' } })
    await followed(remote, [0, 1, 2])
    expect(payloads.find(payload => payload.pageIndex === 1)!.findOptions!.params).toEqual({ after: 'first' })
    expect(payloads.find(payload => payload.pageIndex === 2)!.findOptions!.params).toEqual({ after: 'second' })
    const old = payloads.slice()
    title.value = 'Three'
    for (const payload of old)
      expect(payload.setResult!([])).toBe('inactive')
    await followed(remote, [0])
    await vi.waitFor(() => expect(query.data.value).toEqual([{ id: '3', title: 'Three' }]))
    expect(query.pages.value.filter(Boolean)).toHaveLength(1)
    expect(payloads.at(-1)!.findOptions!.params).toEqual({ where: { title: 'Three' } })
    expect(remote.callCount('unsubscribe')).toBe(3)
  })

  it('publishes and refreshes only the subscription page, superseding its held response', async () => {
    const { store, run, remote, payloads } = await setup()
    const query = await run(() => live(store, 'all'))
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [0, 1])
    const second = payloads.find(payload => payload.pageIndex === 1)!
    const release = remote.holdNext('fetchMany')
    const refreshing = second.refresh!({ pages: [0] })
    try {
      await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(3))
      expect(remote.lastRequest('fetchMany')!.findOptions.pageIndex).toBe(1)
      expect(second.setResult!([{ id: '2', title: 'Pushed two' }])).toBe('applied')
      await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Pushed two' }]))
      expect(query.pages.value[0].data).toEqual([{ id: '1', title: 'One' }])
      expect(query.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(true)
    }
    finally {
      release()
      await refreshing
    }
    expect(query.data.value).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Pushed two' }])
    remote.seed('todos', [{ id: '1', title: 'Changed one' }, { id: '2', title: 'Fresh two' }])
    await second.refresh!()
    expect(remote.callCount('fetchMany')).toBe(4)
    expect(query.data.value).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Fresh two' }])
    await followed(remote, [0, 1])
    expect(remote.callCount('subscribe')).toBe(2)
  })

  it('resubscribes only the page whose options change', async () => {
    const { store, run, remote, payloads } = await setup()
    const query = await run(() => live(store, 'all'))
    await query.fetchMore({ pageIndex: 1, params: { after: 'one' } })
    await followed(remote, [0, 1])
    const first = payloads.find(payload => payload.pageIndex === 0)!
    const second = payloads.find(payload => payload.pageIndex === 1)!
    query.pages.value[1].options = { pageIndex: 1, params: { after: 'two' } }
    expect(second.setResult!([])).toBe('inactive')
    await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(3))
    expect(remote.subscriptions()).toContain(first.subscriptionId)
    expect(payloads.at(-1)!.findOptions!.params).toEqual({ after: 'two' })
    expect(first.setResult!([{ id: '1', title: 'Still live' }])).toBe('applied')
    expect(query.pages.value[0].data).toEqual([{ id: '1', title: 'Still live' }])
  })

  it('ignores function identity changes when comparing subscription options', async () => {
    const { store, run, remote, payloads } = await setup()
    const callback = ref(() => true)
    const query = await run(() => live(store, 'all', () => ({ filter: callback.value })))
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [0, 1])
    const second = payloads.find(payload => payload.pageIndex === 1)!
    callback.value = () => true
    await nextTick()
    await query.foreground.promise
    // Pages reload in place: no reset dropping the followed non-main page, no resubscription.
    expect(query.pages.value[1]).toBeDefined()
    expect(remote.callCount('fetchMany')).toBe(4)
    expect(remote.callCount('subscribe')).toBe(2)
    expect(remote.callCount('unsubscribe')).toBe(0)
    expect(second.setResult!([{ id: '2', title: 'Accepted' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Accepted' }]))
  })

  it('serializes rapid switches during a held subscribe and rejects delivery after disposal', async () => {
    const { store, scope, remote, payloads } = await setup()
    const current = ref(0)
    const owner = scope(() => live(store, () => [current.value]))
    await owner.result
    await owner.result.fetchMore({ pageIndex: 1 })
    await owner.result.fetchMore({ pageIndex: 2 })
    await followed(remote, [0])
    const release = remote.holdNext('subscribe')
    try {
      current.value = 1
      await vi.waitFor(() => expect(remote.callCount('subscribe')).toBe(2))
      current.value = 2
      await nextTick()
      current.value = 0
      await nextTick()
    }
    finally {
      release()
    }
    await followed(remote, [0])
    await vi.waitFor(() => expect(payloads.at(-1)!.pageIndex).toBe(0))
    const before = owner.result.data.value
    owner.stop()
    for (const payload of payloads)
      expect(payload.setResult!([{ id: '9', title: 'Late' }])).toBe('inactive')
    await followed(remote, [])
    expect(owner.result.data.value).toEqual(before)
  })

  it('closes every page when disabled and reopens only the reset main page', async () => {
    const { store, run, remote } = await setup()
    const enabled = ref(true)
    const query = await run(() => live(store, 'all', () => ({ enabled: enabled.value })))
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [0, 1])
    enabled.value = false
    await followed(remote, [])
    enabled.value = true
    await followed(remote, [0])
  })

  it('reports a page index when pagination comes from find defaults', async () => {
    const { store, run, remote, payloads } = await setup({ findDefaults: { pageSize: 1 } })
    await run(() => store.todos.liveQuery((q: any) => q.many()))
    await followed(remote, [0])
    expect(payloads[0]!.pageIndex).toBe(0)
  })

  it('shares reactive connector metadata between followed pages and query', async () => {
    const { store, run, remote, payloads } = await setup()
    const query = await run(() => live(store, 'all'))
    await query.fetchMore({ pageIndex: 1 })
    await followed(remote, [0, 1])
    const total = computed(() => query.meta.value.totalCount)
    expect(total.value).toBeUndefined()
    const metadata = payloads.map(payload => payload.meta as { totalCount?: number })
    metadata[1]!.totalCount = 12
    expect(total.value).toBe(12)
    expect(metadata[0]!.totalCount).toBe(12)
  })

  it.each(['first', 'many'])('omits pageIndex for unpaged %s queries', async (method) => {
    const { store, run, remote, payloads } = await setup()
    await run(() => store.todos.liveQuery((q: any) => method === 'first' ? q.first('1') : q.many()))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    expect(payloads[0]!.pageIndex).toBeUndefined()
  })

  it('opens no page subscriptions on the server', async () => {
    const { store, run, remote } = await setup({ isServer: true })
    const query = await run(() => live(store, 'all'))
    await query.fetchMore({ pageIndex: 1 })
    await nextTick()
    expect(remote.callCount('subscribe')).toBe(0)
    expect(query.data.value.map((row: any) => row.id)).toEqual(['1', '2'])
  })
})
