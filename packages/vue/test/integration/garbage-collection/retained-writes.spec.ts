import { describe, expect, it } from 'vitest'
import { cached, createGarbageCollectionStack, drainGarbageCollection, todoSchema } from './utils'

/** Load a GC-tracked list query, then refresh it after the remote dropped `id: '2'`. */
async function ownThenRelease(stack: Awaited<ReturnType<typeof createGarbageCollectionStack>>) {
  const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
  stack.remote.seed('todos', [{ id: '1' }])
  await query.refresh()
  await drainGarbageCollection()
  return query
}

describe('retained rows', () => {
  it('keeps a retained row after a query owning it releases it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    stack.cache.writeItems({ collection: stack.collection('todos'), items: [{ key: '2', value: { id: '2' } }], retain: true })

    await ownThenRelease(stack)
    stack.cache.garbageCollect()

    expect(cached(stack, 'todos', '2')).toBeDefined()
  })

  it('keeps a query-fetched row once a retained write took it over', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ experimentalGarbageCollection: true })))
    stack.cache.writeItems({ collection: stack.collection('todos'), items: [{ key: 2, value: { id: '2' } }], retain: true })
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh()
    await drainGarbageCollection()

    expect(cached(stack, 'todos', '2')).toBeDefined()
  })

  it('forgets retention when the row is deleted', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: '2', item: { id: '2' }, retain: true })
    stack.cache.deleteItem({ collection, key: '2' })

    await ownThenRelease(stack)

    expect(cached(stack, 'todos', '2')).toBeUndefined()
  })
})
