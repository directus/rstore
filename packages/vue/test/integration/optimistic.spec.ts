import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Single-item `create`/`update`/`delete` all build an optimistic cache layer
// and roll it back on failure (core/src/mutation/{create,update,delete}.ts),
// but only the `*Many` variants had tests. These pin the single-item paths
// through a real query, so a regression shows up as visible stale data.

/** Store with a `todos` collection, a fake remote and a live list query. */
async function setup() {
  const layerEvents: Array<'add' | 'remove'> = []
  const { store, run, remote } = await createVueStack({
    schema: [{ name: 'todos' }],
    data: {
      todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: false },
      ],
    },
    plugins: [
      {
        name: 'layer-spy',
        setup({ hook }: any) {
          hook('cacheLayerAdd', () => layerEvents.push('add'))
          hook('cacheLayerRemove', () => layerEvents.push('remove'))
        },
      },
    ],
  })
  const list = await run(() => store.todos.query((q: any) => q.many()))
  return { store, remote, list, layerEvents }
}

/** Titles currently visible in the list query. */
function titles(list: any) {
  return list.data.value.map((todo: any) => todo.title)
}

describe('optimistic update', () => {
  it('shows the new value before the backend answers', async () => {
    const { store, remote, list } = await setup()
    const release = remote.holdNext('updateItem')

    const promise = store.todos.update({ id: '1', title: 'Optimistic' })
    await nextTick()
    expect(titles(list)).toContain('Optimistic')

    release()
    await promise
    expect(titles(list)).toContain('Optimistic')
    expect(remote.rows('todos')[0]!.title).toBe('Optimistic')
  })

  it('reverts to the previous value when the mutation fails', async () => {
    const { store, remote, list } = await setup()
    remote.failNext('updateItem', new Error('nope'))

    await expect(store.todos.update({ id: '1', title: 'Doomed' })).rejects.toThrow('nope')
    await nextTick()

    expect(titles(list)).toEqual(['One', 'Two'])
    expect(remote.rows('todos')[0]!.title).toBe('One')
  })

  it('adds and removes exactly one cache layer', async () => {
    const { store, layerEvents } = await setup()
    await store.todos.update({ id: '1', title: 'Layered' })
    expect(layerEvents).toEqual(['add', 'remove'])
  })

  it('does not touch the cache when optimistic is disabled', async () => {
    const { store, remote, list } = await setup()
    const release = remote.holdNext('updateItem')

    const promise = store.todos.update({ id: '1', title: 'Late' }, { optimistic: false })
    await nextTick()
    expect(titles(list)).toEqual(['One', 'Two'])

    release()
    await promise
    expect(titles(list)).toContain('Late')
  })
})

describe('optimistic create', () => {
  it('shows the item before the backend answers, then reconciles it', async () => {
    const { store, remote, list } = await setup()
    const release = remote.holdNext('createItem')

    const promise = store.todos.create({ id: '3', title: 'Three', done: false })
    await nextTick()
    expect(titles(list)).toContain('Three')

    release()
    const created = await promise
    await nextTick()
    expect(created.id).toBe('3')
    // One entry only: the optimistic layer is replaced, not stacked on.
    expect(list.data.value.filter((todo: any) => todo.id === '3')).toHaveLength(1)
  })

  it('removes the optimistic item when the create fails', async () => {
    const { store, remote, list } = await setup()
    remote.failNext('createItem', new Error('rejected'))

    await expect(store.todos.create({ id: '3', title: 'Three' })).rejects.toThrow('rejected')
    await nextTick()

    expect(titles(list)).toEqual(['One', 'Two'])
    expect(remote.rows('todos')).toHaveLength(2)
  })

  it('prevents updating an item still held by an optimistic create layer', async () => {
    const { store, remote } = await setup()
    const release = remote.holdNext('createItem')
    const promise = store.todos.create({ id: '3', title: 'Three' })
    await nextTick()

    // `create` sets `prevent: { update, delete }` on its layer — see the
    // reconciliation @TODO in core/src/mutation/create.ts.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(store.todos.update({ id: '3', title: 'Nope' })).rejects.toThrow(/prevented by the layer/)
    error.mockRestore()

    release()
    await promise
  })
})

describe('optimistic delete', () => {
  it('hides the item before the backend answers', async () => {
    const { store, remote, list } = await setup()
    const release = remote.holdNext('deleteItem')

    const promise = store.todos.delete('1')
    await nextTick()
    expect(titles(list)).toEqual(['Two'])

    release()
    await promise
    expect(titles(list)).toEqual(['Two'])
    expect(remote.rows('todos').map(row => row.id)).toEqual(['2'])
  })

  it('restores the item when the delete fails', async () => {
    const { store, remote, list } = await setup()
    remote.failNext('deleteItem', new Error('locked'))

    await expect(store.todos.delete('1')).rejects.toThrow('locked')
    await nextTick()

    expect(titles(list)).toEqual(['One', 'Two'])
    expect(remote.rows('todos')).toHaveLength(2)
  })
})
