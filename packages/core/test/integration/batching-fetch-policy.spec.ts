import { findFirst } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { batchStack, hookPlugin, TWO_TODOS } from './utils/batching'

describe('fetch policy around a batched fetch', () => {
  it('answers a no-cache batched fetch without writing the cache', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })

    const { result } = await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1', fetchPolicy: 'no-cache' },
    })

    expect(result?.title).toBe('One')
    // The batch resolved the row, so an empty cache can only come from the
    // caller honouring the policy.
    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('runs afterFetch around the batched enqueue, on the batched item', async () => {
    const stack = await batchStack({
      data: { todos: [{ id: '1', title: 'One' }] },
      plugins: [hookPlugin('after-fetch', hook => hook('afterFetch', (payload: any) => {
        const item = payload.getResult()
        if (item) {
          payload.setResult({ ...item, seen: item.title })
        }
      }))],
    })

    await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    // `seen` proves afterFetch saw the row the batch returned, and that what it
    // returned is what reached the cache.
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', seen: 'One' })
  })

  it('carries a beforeFetch findOptions change into the batched operation', async () => {
    const stack = await batchStack({
      plugins: [hookPlugin('lang', hook => hook('beforeFetch', (payload: any) => {
        payload.updateFindOptions({ params: { lang: 'fr' } })
      }))],
      on: {
        // Answers from the find options, so the assertion is on the row itself.
        batchFetch: ctx => ctx.payload.operations.forEach((operation: any) => operation.setResult({
          id: operation.key,
          title: operation.findOptions.params?.lang ?? 'none',
        })),
      },
    })

    await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    expect(stack.read('todos', '1')?.title).toBe('fr')
  })

  it('sends a findFirst with batch: false straight to fetchFirst', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })

    await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1', batch: false },
    })

    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'One' })
  })

  it('cannot batch a filter-only findFirst', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })

    await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { filter: (item: any) => item.id === '2' },
    })

    // No key, so there is nothing for a keyed batch to be keyed on.
    expect(stack.remote.callCount('batchFetch')).toBe(0)
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
    expect(stack.remote.lastRequest('fetchFirst')?.key).toBeUndefined()
  })
})
