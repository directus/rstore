import { describe, expect, it } from 'vitest'
import { cached, createGarbageCollectionStack, drainGarbageCollection, queryIds } from './utils'

describe('non-collecting query visible ownership', () => {
  it('updates one row without rereading every retained identity', async () => {
    let keyReads = 0
    const stack = await createGarbageCollectionStack({
      remote: false,
      experimentalGarbageCollection: true,
      schema: [{
        name: 'todos',
        /** Observe ownership traversal through the public collection key resolver. */
        getKey: (item: { id: string }) => {
          keyReads++
          return item.id
        },
      }],
    })
    const size = 256
    const rows = Array.from({ length: size }, (_, index) => ({ id: `t${index}`, text: 'before' }))
    stack.cache.writeItems({ collection: stack.collection('todos'), items: rows.map(value => ({ key: value.id, value })) })
    const owner = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy: 'cache-only',
      experimentalGarbageCollection: false,
    })))
    const query = await owner.result
    await drainGarbageCollection()
    expect(query.data.value).toHaveLength(size)
    keyReads = 0

    stack.cache.writeItem({ collection: stack.collection('todos'), key: 't0', item: { id: 't0', text: 'after' } })
    void query.data.value
    // Whole-table synced readers froze apps: each write rescanned every row twice.
    expect(keyReads).toBeLessThan(16)

    stack.cache.garbageCollect()
    expect(query.data.value).toHaveLength(size)
    expect(cached(stack, 'todos', 't0')?.text).toBe('after')
    owner.stop()
  })

  it('releases a row added after loading once it stops matching the visible result', async () => {
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema: [{ name: 'todos' }] })
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: '2', item: { id: '2' } })
    const owner = stack.scope(() => stack.store.todos.query((q: any) => q.many({
      fetchPolicy: 'cache-only',
      filter: (item: any) => !item.done,
      experimentalGarbageCollection: false,
    })))
    const query = await owner.result
    // The loaded page owns only '2': '1' is retained by the live visible result.
    stack.cache.writeItem({ collection, key: '1', item: { id: '1' } })
    stack.cache.garbageCollect()
    expect(queryIds(query)).toEqual(['2', '1'])

    stack.cache.writeItem({ collection, key: '1', item: { id: '1', done: true } })
    stack.cache.garbageCollect()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    expect(queryIds(query)).toEqual(['2'])
    owner.stop()
  })
})
