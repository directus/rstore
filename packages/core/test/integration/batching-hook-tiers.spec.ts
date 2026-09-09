import { createItem, findFirst, updateItem } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { batchStack } from './utils/batching'

describe('hook tiers', () => {
  it('sends a fetch and a mutation of one tick to their own per-collection hook', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })
    const collection = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    // One group, one flush, but two dispatch keys.
    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.callCount('batchMutate')).toBe(1)
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2'])
  })

  it('skips the per-collection hooks when the unified batch answered everything', async () => {
    const stack = await batchStack({
      batch: ['batch', 'batchFetch', 'batchMutate'],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    expect(stack.remote.callCount('batch')).toBe(1)
    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('batchMutate')).toBe(0)
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2'])
  })

  it('falls the ops the unified batch left through to the per-collection hooks', async () => {
    const stack = await batchStack({
      batch: ['batch', 'batchFetch', 'batchMutate'],
      data: { todos: [{ id: '1', title: 'One' }] },
      on: {
        // Answers the fetches only; the mutations fall through.
        batch: ctx => ctx.payload.fetches.forEach((operation: any) => operation.setResult({
          id: operation.key,
          title: 'Unified',
        })),
      },
    })
    const collection = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('batchMutate')).toBe(1)
    expect(stack.read('todos', '1')?.title).toBe('Unified')
    expect(stack.read('todos', '2')?.title).toBe('Two')
  })

  it('rejects every op when the unified batch throws, without falling through', async () => {
    const stack = await batchStack({
      batch: ['batch', 'batchFetch', 'batchMutate'],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const collection = stack.collection('todos')
    stack.remote.failNext('batch')

    const settled = await Promise.allSettled([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    expect(settled.map(entry => entry.status)).toEqual(['rejected', 'rejected'])
    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('batchMutate')).toBe(0)
  })

  it('puts operations of two collections in the same unified batch', async () => {
    const stack = await batchStack({
      schema: [{ name: 'todos' }, { name: 'lists' }],
      batch: ['batch', 'batchFetch', 'batchMutate'],
      data: {
        todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }],
        lists: [{ id: 'a', name: 'Inbox' }],
      },
    })
    const todos = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection: todos, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      findFirst({ store: stack.store, collection: stack.collection('lists'), findOptions: { key: 'a', fetchPolicy: 'fetch-only' } }),
      updateItem({ store: stack.store, collection: todos, key: '2', item: { title: 'Two!' } as any }),
    ])

    // One call, not one per collection: `flushAll` groups by collection only
    // for the per-collection tier below it.
    expect(stack.remote.callCount('batch')).toBe(1)
    expect(stack.remote.lastRequest('batch')?.keys).toEqual(['1', 'a', '2'])
    expect(stack.read('todos', '1')?.title).toBe('One')
    expect(stack.read('lists', 'a')?.name).toBe('Inbox')
    expect(stack.read('todos', '2')?.title).toBe('Two!')
  })
})
