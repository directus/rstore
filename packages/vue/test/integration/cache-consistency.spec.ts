import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

// Unit tests cover the cache API and a single query in isolation. What was
// never covered: two live queries observing the same items must converge on
// every write, whoever performed it.

/** Store with a `todos` collection backed by the fake remote. */
function setup(rows: Array<Record<string, any>> = [
  { id: '1', title: 'One', done: false },
  { id: '2', title: 'Two', done: true },
  { id: '3', title: 'Three', done: false },
]) {
  return createVueStack({
    schema: [{ name: 'todos' }],
    data: { todos: rows },
  })
}

describe('cache consistency across queries', () => {
  it('keeps a list query and a single-item query in sync after an update', async () => {
    const { store, run } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))
    const one = await run(() => store.todos.query((q: any) => q.first('1')))

    await store.todos.update({ id: '1', title: 'Updated' })
    await nextTick()

    expect(one.data.value.title).toBe('Updated')
    expect(list.data.value.find((todo: any) => todo.id === '1').title).toBe('Updated')
  })

  it('propagates a create into an already loaded list query', async () => {
    const { store, run } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))
    expect(list.data.value).toHaveLength(3)

    await store.todos.create({ id: '4', title: 'Four', done: false })
    await nextTick()

    expect(list.data.value.map((todo: any) => todo.id)).toContain('4')
  })

  it('removes a deleted item from every query holding it', async () => {
    const { store, run } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))
    const one = await run(() => store.todos.query((q: any) => q.first('2')))
    expect(one.data.value.title).toBe('Two')

    await store.todos.delete('2')
    await nextTick()

    expect(one.data.value).toBeFalsy()
    expect(list.data.value.map((todo: any) => todo.id)).not.toContain('2')
  })

  it('updates two queries with different filters from a single write', async () => {
    const { store, run } = await setup()
    const done = await run(() => store.todos.query((q: any) => q.many({
      filter: (todo: any) => todo.done,
      params: { where: { done: true } },
    })))
    const pending = await run(() => store.todos.query((q: any) => q.many({
      filter: (todo: any) => !todo.done,
      params: { where: { done: false } },
    })))
    expect(done.data.value).toHaveLength(1)
    expect(pending.data.value).toHaveLength(2)

    await store.todos.update({ id: '1', done: true })
    await nextTick()

    expect(done.data.value.map((todo: any) => todo.id).sort()).toEqual(['1', '2'])
    expect(pending.data.value.map((todo: any) => todo.id)).toEqual(['3'])
  })

  it('propagates a direct cache write into a live list query', async () => {
    const { store, run } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))

    store.todos.writeItem({ id: '1', title: 'Written', done: false })
    await nextTick()

    expect(list.data.value.find((todo: any) => todo.id === '1').title).toBe('Written')
  })

  it('refetches after clearCollection instead of serving stale items', async () => {
    const { store, run, remote } = await setup()
    const list = await run(() => store.todos.query((q: any) => q.many()))
    expect(remote.callCount('fetchMany', 'todos')).toBe(1)

    remote.seed('todos', [{ id: '9', title: 'Nine', done: false }])
    store.$cache.clearCollection({ collection: store.$collections[0] })
    await list.refresh()

    expect(remote.callCount('fetchMany', 'todos')).toBe(2)
    expect(list.data.value.map((todo: any) => todo.id)).toEqual(['9'])
  })
})
