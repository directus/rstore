import { createItem, deleteItem, findFirst, updateItem } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { batchStack, TWO_TODOS } from './utils/batching'

describe('batch groups', () => {
  it('flushes each group as its own fetch batch', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1' } }),
      findFirst({ store: stack.store, collection, findOptions: { key: '2', batch: { group: 'tenantA' } } }),
    ])

    // A group that reached the hook but not the queue would give one call.
    expect(stack.remote.requests('batchFetch').map(call => call.group).sort()).toEqual(['default', 'tenantA'])
    expect(stack.remote.requests('batchFetch').map(call => call.keys)).toContainEqual(['2'])
  })

  it('carries a create group to the batch', async () => {
    const stack = await batchStack()

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'One' } as any,
      batch: { group: 'tenantA' },
    })

    expect(stack.remote.lastRequest('batchMutate')?.group).toBe('tenantA')
  })

  it('carries an update group to the batch', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Updated' } as any,
      batch: { group: 'tenantB' },
    })

    expect(stack.remote.lastRequest('batchMutate')?.group).toBe('tenantB')
  })

  it('carries a delete group to the batch', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })

    await deleteItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      batch: { group: 'tenantC' },
    })

    expect(stack.remote.lastRequest('batchMutate')?.group).toBe('tenantC')
    expect(stack.remote.rows('todos')).toEqual([])
  })

  it('puts a mutation with batch: true in the default group', async () => {
    const stack = await batchStack()

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'One' } as any,
      batch: true,
    })

    expect(stack.remote.lastRequest('batchMutate')?.group).toBe('default')
  })
})
