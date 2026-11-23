import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection, queryIds } from './utils'

describe('shared list and detail ownership', () => {
  it.each([false, true])('retains a row added to a computed list by a detail read (includes: %s)', async (includePosts) => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      experimentalGarbageCollection: true,
      data: {
        authors: [{ id: 'a2', posts: [{ id: 'p2', authorId: 'a2' }] }, { id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }] }],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a2' }],
      },
    })
    const listScope = stack.scope(() => stack.store.authors.query((q: any) => q.many({
      pageSize: 1,
      fetchPolicy: 'cache-and-fetch',
      include: includePosts ? { posts: true } : undefined,
    })))
    const list = await listScope.result
    await list.background.promise
    expect(queryIds(list)).toEqual(['a2'])

    const key = ref('a1')
    const detailScope = stack.scope(() => stack.store.authors.query((q: any) => q.first({
      key: key.value,
      include: { posts: true },
      fetchPolicy: 'fetch-only',
    })))
    const detail = await detailScope.result
    expect(detail.data.value?.id).toBe('a1')
    expect(queryIds(list).sort()).toEqual(['a1', 'a2'])

    key.value = 'a2'
    await nextTick()
    await detail.foreground.promise
    expect(detail.data.value?.id).toBe('a2')
    await drainGarbageCollection()
    expect(queryIds(list).sort()).toEqual(['a1', 'a2'])
    if (includePosts) {
      expect(list.data.value.find((author: any) => author.id === 'a1')?.posts.map((post: any) => post.id)).toEqual(['p1'])
    }

    listScope.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
    expect(detail.data.value?.id).toBe('a2')
    expect(detail.data.value?.posts.map((post: any) => post.id)).toEqual(['p2'])
  })

  it.each([[false, 'computed'], [false, 'responseRefs'], [true, 'computed'], [true, 'responseRefs']] as const)('preserves a list and its children when a detail is replaced (collection: %s, mode: %s)', async (collect, resultMode) => {
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      experimentalGarbageCollection: true,
      data: {
        authors: [
          { id: 'a1', posts: [{ id: 'p1', authorId: 'a1' }] },
          { id: 'a2', posts: [{ id: 'p2', authorId: 'a2' }] },
        ],
        posts: [{ id: 'p1', authorId: 'a1' }, { id: 'p2', authorId: 'a2' }],
      },
    })
    const listScope = stack.scope(() => stack.store.authors.query((q: any) => q.many({
      include: { posts: true },
      resultMode,
      experimentalGarbageCollection: collect,
    })))
    const list = await listScope.result
    const visible = () => list.data.value.map((author: any) => [author.id, author.posts.map((post: any) => post.id)])
    expect(visible()).toEqual([['a1', ['p1']], ['a2', ['p2']]])

    const key = ref('p1')
    const detailScope = stack.scope(() => stack.store.posts.query((q: any) => q.first({ key: key.value, fetchPolicy: 'fetch-only' })))
    const detail = await detailScope.result
    expect(detail.data.value?.id).toBe('p1')
    key.value = 'p2'
    await vi.waitFor(() => expect(detail.data.value?.id).toBe('p2'))
    await drainGarbageCollection()
    expect(visible()).toEqual([['a1', ['p1']], ['a2', ['p2']]])
    detailScope.stop()
    await drainGarbageCollection()
    expect(visible()).toEqual([['a1', ['p1']], ['a2', ['p2']]])
    listScope.stop()
    await drainGarbageCollection()
    void list.data.value
    stack.cache.garbageCollect()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
  })

  it('retains locally added visible rows while automatic collection is disabled', async () => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, data: { authors: [{ id: 'a1' }] }, experimentalGarbageCollection: true })
    const list = await stack.run(() => stack.store.authors.query((q: any) => q.many({ experimentalGarbageCollection: false })))
    stack.cache.writeItem({ collection: stack.collection('authors'), key: 'a2', item: { id: 'a2' } })
    expect(list.data.value.map((item: any) => item.id)).toEqual(['a1', 'a2'])
    stack.cache.garbageCollect()
    expect(list.data.value.map((item: any) => item.id)).toEqual(['a1', 'a2'])
  })
})
