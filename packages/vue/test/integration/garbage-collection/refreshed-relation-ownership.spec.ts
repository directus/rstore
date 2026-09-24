import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

describe('refreshed relation ownership', () => {
  it('collects nested rows omitted by a refreshed parent response', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }, { id: 'p3', authorId: 'a1' }] }],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }, { id: 'p3', authorId: 'a1' }],
      },
    })
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: true },
      experimentalGarbageCollection: true,
    })))
    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1', 'p2', 'p3'])

    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1' }])
    stack.remote.seed('authors', [{ id: 'a1', name: 'Ada', posts: [{ id: 'p1', authorId: 'a1' }] }])
    await query.refresh()
    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1'])
    await drainGarbageCollection()

    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1'])
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(cached(stack, 'posts', 'p2')).toBeUndefined()
    expect(cached(stack, 'posts', 'p3')).toBeUndefined()

    stack.remote.seed('posts', [])
    stack.remote.seed('authors', [{ id: 'a1', name: 'Ada', posts: [] }])
    await query.refresh()
    await drainGarbageCollection()
    expect(query.data.value[0].posts).toEqual([])
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
  })

  // Caveat: relations resolve from the shared cache, so a row released by the
  // parent stays visible there while another query retains it.
  it.each(['computed', 'responseRefs'] as const)('collects a released embedded row once an overlapping query releases it (%s)', async (resultMode) => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }] }],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a1' }],
      },
    })
    const parent = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: true },
      resultMode,
      experimentalGarbageCollection: true,
    })))
    const sibling = stack.scope(() => stack.store.posts.query((q: any) => q.many({
      fetchPolicy: 'cache-only',
      experimentalGarbageCollection: true,
    })))
    await sibling.result
    const heldPosts = computed(() => parent.data.value[0].posts.map((post: any) => post.id))

    stack.remote.seed('posts', [{ id: 'p1', authorId: 'a1' }])
    stack.remote.seed('authors', [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }] }])
    await parent.refresh()
    await drainGarbageCollection()
    expect(heldPosts.value).toEqual(['p1', 'p2'])
    expect(cached(stack, 'posts', 'p2')).toBeDefined()

    sibling.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'posts', 'p2')).toBeUndefined()
    expect(heldPosts.value).toEqual(['p1'])
  })

  it('collects released descendants through multiple relation levels', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1', comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p1' }] }] }],
        posts: [{ id: 'p1', authorId: 'a1' }],
        comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p1' }],
      },
    })
    const parent = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: { comments: true } },
      experimentalGarbageCollection: true,
    })))

    stack.remote.seed('comments', [{ id: 'c1', postId: 'p1' }])
    stack.remote.seed('authors', [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1', comments: [{ id: 'c1', postId: 'p1' }] }] }])
    await parent.refresh()
    await drainGarbageCollection()

    expect(parent.data.value[0].posts[0].comments.map((comment: any) => comment.id)).toEqual(['c1'])
    expect(cached(stack, 'comments', 'c2')).toBeUndefined()
  })

  it('collects a to-one target when the refreshed relation is null', async () => {
    const stack = await createGarbageCollectionStack({
      schema: [
        { name: 'authors', relations: { profile: { to: { profiles: { on: { authorId: 'id' } } } } } },
        { name: 'profiles' },
      ],
      data: {
        authors: [{ id: 'a1', profile: { id: 'pr1', authorId: 'a1' } }],
        profiles: [{ id: 'pr1', authorId: 'a1' }],
      },
    })
    const parent = await stack.run(() => stack.store.authors.query((q: any) => q.first({
      key: 'a1',
      include: { profile: true },
      experimentalGarbageCollection: true,
    })))
    expect(parent.data.value.profile.id).toBe('pr1')

    stack.remote.seed('authors', [{ id: 'a1', profile: null }])
    await parent.refresh()
    await drainGarbageCollection()

    expect(parent.data.value.profile).toBeUndefined()
    expect(cached(stack, 'profiles', 'pr1')).toBeUndefined()
  })

  it('retains cached nested rows when a refreshed relation omits their field', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1', comments: [{ id: 'c1', postId: 'p1' }] }] }],
        posts: [{ id: 'p1', authorId: 'a1' }],
        comments: [{ id: 'c1', postId: 'p1' }],
      },
    })
    const parent = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: { comments: true } },
      experimentalGarbageCollection: true,
    })))

    stack.remote.seed('authors', [{ id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }] }])
    await parent.refresh()
    await drainGarbageCollection()

    expect(cached(stack, 'comments', 'c1')).toBeDefined()
    expect(parent.data.value[0].posts[0].comments.map((comment: any) => comment.id)).toEqual(['c1'])
  })

  it('retains separately fetched targets when a parent response omits the relation field', async () => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        authors: [{ id: 'a1' }],
        posts: [{ id: 'p1', authorId: 'a1' }],
      },
    })
    const parent = await stack.run(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: true },
      experimentalGarbageCollection: true,
    })))
    expect(parent.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1'])

    await parent.refresh()
    await drainGarbageCollection()
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    expect(parent.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1'])
  })
})
