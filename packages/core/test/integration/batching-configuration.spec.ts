import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, findFirst } from '@rstore/core'
import { describe, expect, it } from 'vitest'

describe('store batching configuration', () => {
  it('can disable fetch batching without disabling mutation batching', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
      batch: true,
      batching: { fetch: false, mutations: true },
    })
    const collection = stack.collection('todos')

    await findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } })
    await createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any })

    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
    expect(stack.remote.callCount('batchMutate')).toBe(1)
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.read('todos', '2')).toMatchObject({ title: 'Two' })
  })

  it('can disable mutation batching without disabling fetch batching', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
      batch: true,
      batching: { fetch: true, mutations: false },
    })
    const collection = stack.collection('todos')

    await findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } })
    await createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any })

    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
    expect(stack.remote.callCount('batchMutate')).toBe(0)
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2'])
  })
})
