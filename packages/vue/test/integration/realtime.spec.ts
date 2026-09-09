import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { realtimeReconnectEventHook } from '../../src'

// `subscription.spec.ts` proves the subscribe/unsubscribe hooks fire with the
// right options. What it never proves is delivery: a frame arriving from the
// transport must reach the cache and update an open live query. That path
// only existed in the Playwright suites.

/** Store with a live list query already open on `todos`. */
async function setup() {
  const { store, run, remote, dispose } = await createVueStack({
    schema: [{ name: 'todos' }],
    data: {
      todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: false },
      ],
    },
  })
  const list = await run(() => store.todos.liveQuery((q: any) => q.many()))
  await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
  return { store, run, remote, list, dispose }
}

/** Ids currently visible in the live query. */
function ids(list: any) {
  return list.data.value.map((todo: any) => todo.id)
}

describe('realtime delivery', () => {
  it('adds an item from a created frame without a refresh', async () => {
    const { remote, list } = await setup()
    const fetches = remote.callCount('fetchMany')

    remote.emit({ type: 'created', collection: 'todos', item: { id: '3', title: 'Three', done: false } })
    await nextTick()

    expect(ids(list)).toContain('3')
    expect(remote.callCount('fetchMany')).toBe(fetches)
  })

  it('applies an updated frame to the item already displayed', async () => {
    const { remote, list } = await setup()

    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Renamed' } })
    await nextTick()

    expect(list.data.value.find((todo: any) => todo.id === '1').title).toBe('Renamed')
  })

  it('removes an item from a deleted frame', async () => {
    const { remote, list } = await setup()

    remote.emit({ type: 'deleted', collection: 'todos', key: '2' })
    await nextTick()

    expect(ids(list)).toEqual(['1'])
  })

  it('ignores frames for another collection', async () => {
    const { remote, list } = await setup()

    remote.emit({ type: 'created', collection: 'others', item: { id: 'x' } })
    await nextTick()

    expect(ids(list)).toEqual(['1', '2'])
  })

  it('unsubscribes when the owning scope is disposed', async () => {
    const { remote, dispose } = await setup()

    dispose()
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(0))
  })

  it('refreshes the query when the transport reconnects', async () => {
    const { remote, list } = await setup()
    const fetches = remote.callCount('fetchMany')
    remote.seed('todos', [
      { id: '1', title: 'One', done: false },
      { id: '2', title: 'Two', done: false },
      { id: '9', title: 'Nine', done: false },
    ])

    realtimeReconnectEventHook.trigger()

    await vi.waitFor(() => expect(remote.callCount('fetchMany')).toBe(fetches + 1))
    expect(ids(list)).toContain('9')
  })
})
