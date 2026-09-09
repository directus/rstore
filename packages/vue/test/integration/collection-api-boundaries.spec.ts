import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('collection mutation API', () => {
  it('runs many mutations through backend and cache boundaries', async () => {
    const { store, remote } = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    await store.todos.findMany()

    await store.todos.createMany([{ id: '2', title: 'Two' }, { id: '3', title: 'Three' }])
    await store.todos.updateMany([{ id: '1', title: 'First' }, { id: '2', title: 'Second' }])
    await store.todos.deleteMany(['1', { id: '3' }])

    expect(remote.rows('todos')).toEqual([{ id: '2', title: 'Second' }])
    expect(store.todos.peekMany().map((item: any) => [item.id, item.title])).toEqual([['2', 'Second']])
    expect(remote.callCount('createMany')).toBe(1)
    expect(remote.callCount('updateMany')).toBe(1)
    expect(remote.callCount('deleteMany')).toBe(1)
  })

  it('gets, writes, and clears a falsy key through collection methods', async () => {
    const { store } = await createVueStack({ schema: [{ name: 'todos' }], remote: false })

    expect(store.todos.getKey({ id: 0 })).toBe(0)
    const item = store.todos.writeItem({ id: 0, title: 'Zero' })
    expect(item.$getKey()).toBe(0)
    expect(store.todos.peekFirst(0)).toBe(item)

    store.todos.clearItem(0)
    expect(store.todos.peekFirst(0)).toBeNull()
  })

  it('rejects keyless writes and item-shaped deletes before remote dispatch', async () => {
    const { store, remote } = await createVueStack({ schema: [{ name: 'todos' }] })

    expect(() => store.todos.writeItem({ title: 'Missing' })).toThrow('Item write failed: key is not defined')
    expect(() => store.todos.delete({ title: 'Missing' })).toThrow('Item delete failed: key is not defined')
    expect(() => store.todos.deleteMany([{ id: '1' }, { title: 'Missing' }]))
      .toThrow('Item delete failed: key is not defined')
    expect(remote.callCount('deleteItem')).toBe(0)
    expect(remote.callCount('deleteMany')).toBe(0)
  })
})
