import { describe, expect, it, vi } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, queryIds } from '../garbage-collection/utils'

/** Todos next to an unrelated collection the pruning must not touch. */
const todoSchema = [{ name: 'todos' }, { name: 'tags' }]

describe('refresh prune', () => {
  it('deletes cached rows absent from the refreshed result, without garbage collection', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: {
        todos: [{ id: '1' }, { id: '2' }, { id: '3' }],
        tags: [{ id: 't1' }],
      },
    })
    await stack.store.tags.findMany()
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many()))
    stack.remote.seed('todos', [{ id: '1', title: 'fresh' }])

    await query.refresh()
    expect(cached(stack, 'todos', '2')).toBeDefined()

    await query.refresh({ prune: true })
    expect(cached(stack, 'todos', '1')?.title).toBe('fresh')
    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(cached(stack, 'todos', '3')).toBeUndefined()
    expect(cached(stack, 'tags', 't1')).toBeDefined()
    expect(queryIds(query)).toEqual(['1'])
  })

  it.each([false, true])('deletes rows of included relation collections at every level (garbage collection: %s)', async (experimentalGarbageCollection) => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      experimentalGarbageCollection,
      data: {
        authors: [
          { id: 'a1', posts: [{ id: 'p1', authorId: 'a1', comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p1' }] }, { id: 'p2', authorId: 'a1' }] },
          { id: 'a2', posts: [{ id: 'p3', authorId: 'a2' }] },
        ],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }, { id: 'p3', authorId: 'a2' }],
        comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p1' }],
      },
    })
    // A page size makes the page a cache-computed slice, which still shows stale rows.
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: { include: { comments: true } } },
      pageSize: 10,
    })))
    stack.remote.seed('authors', [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1', comments: [{ id: 'c1', postId: 'p1' }] }] }])
    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1' }])
    stack.remote.seed('comments', [{ id: 'c1', postId: 'p1' }])

    await query.refresh({ prune: true })

    expect(cached(stack, 'authors', 'a1')).toBeDefined()
    expect(cached(stack, 'authors', 'a2')).toBeUndefined()
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(cached(stack, 'posts', 'p2')).toBeUndefined()
    expect(cached(stack, 'posts', 'p3')).toBeUndefined()
    expect(cached(stack, 'comments', 'c1')).toBeDefined()
    expect(cached(stack, 'comments', 'c2')).toBeUndefined()
  })

  it('keeps the rows of pages left out of the refresh', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
    })))
    await query.fetchMore({ pageIndex: 1 })
    stack.cache.writeItem({ collection: stack.collection('todos'), key: '3', item: { id: '3' } })

    await query.refresh({ prune: true, pages: [0] })

    expect(cached(stack, 'todos', '1')).toBeDefined()
    expect(cached(stack, 'todos', '2')).toBeDefined()
    expect(cached(stack, 'todos', '3')).toBeUndefined()
  })

  it('prunes nothing when a refreshed page fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many()))
    stack.remote.seed('todos', [{ id: '1' }])
    stack.remote.failNext('fetchMany')

    await query.refresh({ prune: true })

    expect(query.error.value).toBeInstanceOf(Error)
    expect(cached(stack, 'todos', '2')).toBeDefined()
    consoleError.mockRestore()
  })

  it('prunes nothing for a no-cache query, whose result is not in the cache', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
    })
    await stack.store.todos.findMany()
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'no-cache' })))
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh({ prune: true })

    expect(cached(stack, 'todos', '2')).toBeDefined()
  })

  it('prunes after the refresh writes queued by a paused cache', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }] }],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }],
      },
    })
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: true },
    })))
    stack.remote.seed('authors', [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1', title: 'fresh' }] }])
    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1', title: 'fresh' }])

    stack.cache.pause()
    await query.refresh({ prune: true })
    expect(cached(stack, 'posts', 'p2')).toBeDefined()
    stack.cache.resume()

    expect(cached(stack, 'posts', 'p1')?.title).toBe('fresh')
    expect(cached(stack, 'posts', 'p2')).toBeUndefined()
  })

  it('deletes rows another live query still owns', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1' }, { id: '2' }] },
      experimentalGarbageCollection: true,
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many()))
    const sibling = await stack.run(() => stack.store.todos.query((q: any) => q.first('2')))
    stack.remote.seed('todos', [{ id: '1' }])

    await query.refresh({ prune: true })

    expect(cached(stack, 'todos', '2')).toBeUndefined()
    expect(sibling.data.value).toBeFalsy()
  })
})
