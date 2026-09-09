import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('wrapped item API', () => {
  it('exposes identity, computed values, and read-only data', async () => {
    const { store } = await createVueStack({
      schema: [{
        name: 'todos',
        getKey: (item: any) => item.id,
        computed: { label: (item: any) => `${item.id}: ${item.title}` },
      }],
      data: { todos: [{ id: 7, title: 'Seven' }] },
    })

    const item = await store.todos.findFirst(7)

    expect(item.$collection).toBe('todos')
    expect(item.$getKey()).toBe(7)
    expect(item.$isOptimistic).toBe(false)
    expect(item.label).toBe('7: Seven')
    expect(() => {
      item.title = 'Changed directly'
    }).toThrow('Items are read-only. Use `item.$updateForm()` to update the item.')
  })

  it('updates and deletes through backend and cache boundaries', async () => {
    const { store, remote } = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const item = await store.todos.findFirst('1')

    const updated = await item.$update({ title: 'Updated' })

    expect(updated.title).toBe('Updated')
    expect(remote.lastRequest('updateItem')).toMatchObject({ collection: 'todos', key: '1', item: { title: 'Updated' } })
    expect(store.todos.peekFirst('1').title).toBe('Updated')

    await item.$delete()

    expect(remote.lastRequest('deleteItem')).toMatchObject({ collection: 'todos', key: '1' })
    expect(remote.rows('todos')).toEqual([])
    expect(store.todos.peekFirst('1')).toBeNull()
  })

  it('creates a populated update form that submits through the item key', async () => {
    const { store, remote } = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One', done: false }] },
    })
    const item = await store.todos.findFirst('1')

    const form = await item.$updateForm()
    expect(form.$getRawData()).toMatchObject({ id: '1', title: 'One', done: false })

    form.title = 'From form'
    await form.$submit()

    expect(remote.lastRequest('updateItem')).toMatchObject({ collection: 'todos', key: '1', item: { title: 'From form' } })
    expect(store.todos.peekFirst('1').title).toBe('From form')
  })

  it('uses a schema supplied to $updateForm before reaching the backend', async () => {
    const { store, remote } = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const item = await store.todos.findFirst('1')
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: async (data: any) => ({
          value: data,
          issues: data.title ? undefined : [{ message: 'Title is required' }],
        }),
      },
    }
    const form = await item.$updateForm({ schema })
    form.title = ''

    await expect(form.$submit()).rejects.toThrow('Title is required')
    expect(form.$schema).toBe(schema)
    expect(remote.callCount('updateItem')).toBe(0)
  })
})
