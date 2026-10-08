import { createCoreStack } from '#test-utils/store/coreStack'
import { deleteItem, findMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

describe('deleteItem failure recovery', () => {
  it('restores held deletion without history or backend effects, then permits a valid retry', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [
        { id: 'target', title: 'Keep until committed', done: false },
        { id: 'other', title: 'Unrelated', done: true },
      ] },
    })
    const collection = stack.collection('todos')
    await findMany({ store: stack.store, collection })
    const failure = new Error('delete refused')
    stack.remote.failNext('deleteItem', failure)
    const release = stack.remote.holdNext('deleteItem')
    let settled = false
    const outcome = deleteItem({ store: stack.store, collection, key: 'target' }).then(
      () => undefined,
      error => error,
    )
    void outcome.then(() => {
      settled = true
    })
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('deleteItem')).toBe(1))
      expect(settled, 'held delete must remain pending').toBe(false)
      expect(stack.read('todos', 'target')).toBeUndefined()
      expect(stack.read('todos', 'other')).toMatchObject({ id: 'other', title: 'Unrelated', done: true })
      expect(stack.remote.rows('todos')).toEqual([
        { id: 'target', title: 'Keep until committed', done: false },
        { id: 'other', title: 'Unrelated', done: true },
      ])
      expect(stack.store.$mutationHistory).toEqual([])
    }
    finally {
      release()
      await vi.waitFor(() => expect(settled, 'released delete must settle').toBe(true))
    }

    expect(await outcome).toBe(failure)
    expect(stack.read('todos', 'target')).toMatchObject({ id: 'target', title: 'Keep until committed', done: false })
    expect(stack.read('todos', 'other')).toMatchObject({ id: 'other', title: 'Unrelated', done: true })
    expect(stack.remote.rows('todos')).toEqual([
      { id: 'target', title: 'Keep until committed', done: false },
      { id: 'other', title: 'Unrelated', done: true },
    ])
    expect(stack.store.$mutationHistory).toEqual([])

    await deleteItem({ store: stack.store, collection, key: 'target' })

    expect(stack.read('todos', 'target')).toBeUndefined()
    expect(stack.read('todos', 'other')).toMatchObject({ id: 'other', title: 'Unrelated', done: true })
    expect(stack.remote.rows('todos')).toEqual([{ id: 'other', title: 'Unrelated', done: true }])
    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.key])).toEqual([['delete', 'target']])
  })
})
