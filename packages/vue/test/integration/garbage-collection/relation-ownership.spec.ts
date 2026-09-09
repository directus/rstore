import { describe, expect, it } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

describe('relation ownership', () => {
  it.each([false, true])('retains deeper include targets after cache-only reads (shallow path: %s)', async (shallow) => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, remote: false })
    for (const [name, rows] of Object.entries({
      posts: [{ id: 'p1', authorId: 'a1', editorId: 'a1' }, { id: 'p2', authorId: 'a1' }],
      authors: [{ id: 'a1', name: 'Ada' }],
      comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p2' }],
    })) {
      for (const item of rows) {
        stack.cache.writeItem({ collection: stack.collection(name), key: item.id, item })
      }
    }
    const scope = stack.scope(() => stack.store.posts.query((q: any) => q.first({
      key: 'p1',
      fetchPolicy: 'cache-only',
      experimentalGarbageCollection: true,
      include: shallow
        ? { author: true, editor: { posts: { comments: true } } }
        : { editor: { posts: { comments: true } } },
    })))
    const query = await scope.result
    /** Descendants selected through the deeper path, including a revisited parent. */
    const comments = () => query.data.value.editor.posts.flatMap((post: any) => post.comments.map((comment: any) => comment.id))
    expect(comments()).toEqual(['c1', 'c2'])
    await drainGarbageCollection()
    stack.cache.garbageCollect()
    expect(comments()).toEqual(['c1', 'c2'])
    expect(cached(stack, 'comments', 'c1')?.id).toBe('c1')
    expect(cached(stack, 'comments', 'c2')?.id).toBe('c2')

    scope.stop()
    await drainGarbageCollection()
    expect(stack.store.posts.peekMany()).toEqual([])
    expect(stack.store.authors.peekMany()).toEqual([])
    expect(stack.store.comments.peekMany()).toEqual([])
  })

  it('keeps an embedded to-one target while its parent owns it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', authorId: 'a1', author: { id: 'a1', name: 'Ada' } }],
        authors: [{ id: 'a1', name: 'Ada' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      include: { author: true },
      experimentalGarbageCollection: true,
    })))
    expect(query.data.value[0].author.name).toBe('Ada')
    await drainGarbageCollection()

    expect(query.data.value[0].author.name).toBe('Ada')
    expect(cached(stack, 'authors', 'a1')).toBeDefined()
  })

  it('keeps a separately fetched target while its parent owns it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', authorId: 'a1' }],
        authors: [{ id: 'a1', name: 'Ada' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      include: { author: true },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()

    expect(query.data.value[0].author.name).toBe('Ada')
    expect(cached(stack, 'authors', 'a1')).toBeDefined()
    expect(stack.remote.callCount('fetchMany', 'authors')).toBe(1)
  })

  it('keeps nested targets through a cyclic include only once', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', name: 'Ada' }],
        posts: [{ id: 'p1', authorId: 'a1' }],
        comments: [{ id: 'c1', postId: 'p1' }],
      },
    })
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: { comments: { post: true } } },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()

    expect(query.data.value[0].posts[0].comments[0].post.id).toBe('p1')
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(cached(stack, 'comments', 'c1')).toBeDefined()
  })

  it('keeps a nested to-many target two levels below its owner', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', name: 'Ada' }],
        posts: [{ id: 'p1', authorId: 'a1' }],
        comments: [{ id: 'c1', postId: 'p1' }],
      },
    })
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: { comments: true } },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()

    expect(query.data.value[0].posts[0].comments[0].id).toBe('c1')
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(cached(stack, 'comments', 'c1')).toBeDefined()
  })

  it('releases a target removed from an include while retaining its parent', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', authorId: 'a1' }],
        authors: [{ id: 'a1', name: 'Ada' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      include: { author: true },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()
    expect(cached(stack, 'authors', 'a1')).toBeDefined()

    stack.remote.seed('posts', [{ id: 'p1', authorId: null }])
    await query.refresh()
    await drainGarbageCollection()

    expect(query.data.value.map((post: any) => post.id)).toEqual(['p1'])
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
  })

  it('keeps a target reached by one relation path after another path disappears', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', authorId: 'a1', editorId: 'a1' }],
        authors: [{ id: 'a1', name: 'Ada' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      include: { author: true, editor: true },
      experimentalGarbageCollection: true,
    })))
    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1', editorId: null }])

    await query.refresh()
    await drainGarbageCollection()

    expect(query.data.value[0].author.id).toBe('a1')
    expect(cached(stack, 'authors', 'a1')).toBeDefined()
    stack.remote.seed('posts', [{ id: 'p1', authorId: null, editorId: null }])
    await query.refresh()
    await drainGarbageCollection()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
  })

  it('tracks nested targets from the custom include wrapper shape', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', name: 'Ada' }],
        posts: [{ id: 'p1', authorId: 'a1' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      include: { author: { include: { posts: true } } },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()

    expect(query.data.value[0].author.posts.map((post: any) => post.id)).toEqual(['p1'])
    expect(cached(stack, 'authors', 'a1')).toBeDefined()
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
  })

  it('keeps a shared relation target until both owning parent pages release it', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }],
        authors: [{ id: 'a1', name: 'Ada' }],
      },
    })
    const query = await stack.run(() => stack.store.posts.query((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      include: { author: true },
      experimentalGarbageCollection: true,
    })))
    await query.fetchMore({ pageIndex: 1 })

    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1' }])
    await query.refresh({ pages: [1] })
    await drainGarbageCollection()

    expect(cached(stack, 'authors', 'a1')).toBeDefined()

    stack.remote.seed('posts', [])
    await query.refresh()
    await drainGarbageCollection()
    expect(query.data.value).toEqual([])
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
  })
})
