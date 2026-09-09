import { createItem, deleteItem, updateItem } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { batchStack, TWO_TODOS } from './utils/batching'

describe('batched mutation dispatch', () => {
  it('routes each created row back to the caller that created it', async () => {
    const stack = await batchStack()
    const collection = stack.collection('todos')

    const [first, second] = await Promise.all([
      createItem({ store: stack.store, collection, item: { id: '1', title: 'One' } as any }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    expect(first).toMatchObject({ id: '1', title: 'One' })
    expect(second).toMatchObject({ id: '2', title: 'Two' })
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2'])
  })

  it('batches every create of a tick into one batchMutate call', async () => {
    const stack = await batchStack()
    const collection = stack.collection('todos')

    await Promise.all(['1', '2', '3'].map(id => createItem({
      store: stack.store,
      collection,
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(stack.remote.callCount('batchMutate')).toBe(1)
    expect(stack.remote.lastRequest('batchMutate')?.mutation).toBe('create')
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2', '3'])
  })

  it('batches updates of a tick as one update batch', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')

    await Promise.all([
      updateItem({ store: stack.store, collection, key: '1', item: { title: 'One!' } as any }),
      updateItem({ store: stack.store, collection, key: '2', item: { title: 'Two!' } as any }),
    ])

    expect(stack.remote.lastRequest('batchMutate')?.mutation).toBe('update')
    expect(stack.remote.rows('todos').map(row => row.title)).toEqual(['One!', 'Two!'])
    expect(stack.readMany('todos').map(item => item.title)).toEqual(['One!', 'Two!'])
  })

  it('batches deletes of a tick as one delete batch', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')

    await Promise.all(['1', '2'].map(key => deleteItem({ store: stack.store, collection, key })))

    expect(stack.remote.lastRequest('batchMutate')?.mutation).toBe('delete')
    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('does not mutate an op the batch already answered', async () => {
    const stack = await batchStack({
      on: {
        // Answers the first create only, leaving the second to `createItem`.
        batchMutate: (ctx) => {
          const [first] = ctx.payload.operations
          first.setResult(ctx.upsert({ ...first.item, title: 'Batched' }))
        },
      },
    })
    const collection = stack.collection('todos')

    await Promise.all([
      createItem({ store: stack.store, collection, item: { id: '1', title: 'One' } as any }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any }),
    ])

    // `flushMutation.ts` falls only the *unresolved* ops through: dropping that
    // filter would create row '1' a second time.
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.remote.lastRequest('createItem')?.item).toMatchObject({ id: '2' })
    expect(stack.read('todos', '1')?.title).toBe('Batched')
    expect(stack.read('todos', '2')?.title).toBe('Two')
  })

  it('writes the siblings of an op the batch rejected with setError', async () => {
    const stack = await batchStack({
      on: {
        batchMutate: ctx => ctx.payload.operations.forEach((operation: any) => {
          if (operation.item.id === '2') {
            operation.setError(new Error('batch rejected 2'))
          }
          else {
            operation.setResult(ctx.upsert(operation.item))
          }
        }),
      },
    })
    const collection = stack.collection('todos')

    const settled = await Promise.allSettled(['1', '2'].map(id => createItem({
      store: stack.store,
      collection,
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(settled.map(entry => entry.status)).toEqual(['fulfilled', 'rejected'])
    expect(stack.read('todos', '1')).toMatchObject({ id: '1' })
    // A rejected op is resolved, so it must not reach the individual tier, and
    // its optimistic layer must be gone.
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.read('todos', '2')).toBeUndefined()
  })

  it('falls a create through to createItem when no batchMutate answers', async () => {
    const stack = await batchStack({ batch: false })

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'One' } as any,
    })

    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'One' })
  })

  it('falls an update through to updateItem when no batchMutate answers', async () => {
    const stack = await batchStack({ batch: false, data: { todos: [{ id: '1', title: 'One' }] } })

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Updated' } as any,
    })

    expect(stack.remote.callCount('updateItem')).toBe(1)
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Updated' }])
    expect(stack.read('todos', '1')?.title).toBe('Updated')
  })

  it('falls a delete through to deleteItem when no batchMutate answers', async () => {
    const stack = await batchStack({ batch: false, data: { todos: [{ id: '1', title: 'One' }] } })

    await deleteItem({ store: stack.store, collection: stack.collection('todos'), key: '1' })

    expect(stack.remote.callCount('deleteItem')).toBe(1)
    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('rejects only the failing op of a mutation fall-through', async () => {
    const stack = await batchStack({
      batch: false,
      on: {
        createItem: (ctx) => {
          if (ctx.item?.id === '2') {
            throw new Error('createItem failed for 2')
          }
          return ctx.next()
        },
      },
    })
    const collection = stack.collection('todos')

    const settled = await Promise.allSettled(['1', '2'].map(id => createItem({
      store: stack.store,
      collection,
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(settled.map(entry => entry.status)).toEqual(['fulfilled', 'rejected'])
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1'])
  })

  it('rejects every op a throwing batchMutate left unanswered', async () => {
    const stack = await batchStack()
    const collection = stack.collection('todos')
    stack.remote.failNext('batchMutate')

    const settled = await Promise.allSettled(['1', '2'].map(id => createItem({
      store: stack.store,
      collection,
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(settled.map(entry => entry.status)).toEqual(['rejected', 'rejected'])
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.readMany('todos')).toEqual([])
  })
})
