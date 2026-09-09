import { describe, expect, it } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

describe('relation ownership after live cache writes', () => {
  it.each(['author-first', 'parent-first'] as const)('adopts replacement targets (%s)', async (order) => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, remote: false })
    stack.store.authors.writeItem({ id: 'a1', name: 'Ada' })
    stack.store.posts.writeItem({ id: 'p1', authorId: 'a1' })
    const owner = stack.scope(() => stack.store.posts.query((q: any) => q.first({
      key: 'p1',
      fetchPolicy: 'cache-only',
      include: { author: true },
      experimentalGarbageCollection: true,
    })))
    const query = await owner.result
    await drainGarbageCollection()
    expect(query.data.value.author.name).toBe('Ada')
    if (order === 'author-first')
      stack.store.authors.writeItem({ id: 'a2', name: 'Bob' })
    stack.store.posts.writeItem({ id: 'p1', authorId: 'a2' })
    if (order === 'parent-first')
      stack.store.authors.writeItem({ id: 'a2', name: 'Bob' })
    expect(query.data.value.author.name).toBe('Bob')
    // Even an immediate public sweep must retain the now-visible relation.
    stack.cache.garbageCollect()
    expect(query.data.value.author?.name).toBe('Bob')
    await drainGarbageCollection()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    owner.stop()
    await drainGarbageCollection()
    expect(stack.store.posts.peekMany()).toEqual([])
    expect(stack.store.authors.peekMany()).toEqual([])
  })

  it('retains a newly connected to-many target until its final owner stops', async () => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, remote: false })
    stack.store.authors.writeItem({ id: 'a1' })
    const parent = stack.scope(() => stack.store.authors.query((q: any) => q.first({
      key: 'a1',
      fetchPolicy: 'cache-only',
      include: { posts: true },
      experimentalGarbageCollection: true,
    })))
    const query = await parent.result
    await drainGarbageCollection()
    stack.store.posts.writeItem({ id: 'p1', authorId: 'a1' })
    expect(query.data.value.posts.map((post: any) => post.id)).toEqual(['p1'])
    stack.cache.garbageCollect()
    expect(query.data.value.posts.map((post: any) => post.id)).toEqual(['p1'])
    const sibling = stack.scope(() => stack.store.posts.query((q: any) => q.first({
      key: 'p1',
      fetchPolicy: 'cache-only',
      experimentalGarbageCollection: true,
    })))
    await sibling.result
    parent.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'posts', 'p1')?.id).toBe('p1')
    sibling.stop()
    await drainGarbageCollection()
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
  })
})
