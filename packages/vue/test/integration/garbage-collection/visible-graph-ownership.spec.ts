import type { StoreSchema } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

/** Open a non-collecting authors list that renders each author's posts. */
async function openAuthorsWithPosts(stack: Awaited<ReturnType<typeof createGarbageCollectionStack>>, filter?: (item: any) => boolean) {
  const owner = stack.scope(() => stack.store.authors.query((q: any) => q.many({
    fetchPolicy: 'cache-only',
    include: { posts: true },
    filter,
    experimentalGarbageCollection: false,
  })))
  const query = await owner.result
  await drainGarbageCollection()
  return { owner, query }
}

/** Write one author and its posts straight into the cache. */
function writeAuthor(stack: Awaited<ReturnType<typeof createGarbageCollectionStack>>, id: string, postIds: string[], extra: Record<string, unknown> = {}) {
  stack.cache.writeItem({ collection: stack.collection('authors'), key: id, item: { id, ...extra } })
  for (const postId of postIds)
    stack.cache.writeItem({ collection: stack.collection('posts'), key: postId, item: { id: postId, authorId: id } })
}

describe('non-collecting query visible relation ownership', () => {
  it('updates one related row without walking every visible relation graph', async () => {
    let keyReads = 0
    /** Count ownership traversal through the public collection key resolver. */
    const getKey = (item: { id: string }) => {
      keyReads++
      return item.id
    }
    const schema: StoreSchema = blogSchema.map(collection => ({ ...collection, getKey }))
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema })
    const size = 128
    for (let index = 0; index < size; index++)
      writeAuthor(stack, `a${index}`, [`p${index}`])
    const { owner, query } = await openAuthorsWithPosts(stack)
    expect(query.data.value).toHaveLength(size)
    keyReads = 0

    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p0', item: { id: 'p0', authorId: 'a0', title: 'after' } })
    void query.data.value
    // Each publication used to re-walk every author and every author's posts.
    expect(keyReads).toBeLessThan(32)

    stack.cache.garbageCollect()
    expect(cached(stack, 'posts', 'p0')?.title).toBe('after')
    expect(cached(stack, 'posts', `p${size - 1}`)).toBeDefined()
    owner.stop()
  })

  it('retains a related row added after loading until it leaves the visible graph', async () => {
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema: blogSchema })
    writeAuthor(stack, 'a1', ['p1'])
    const { owner, query } = await openAuthorsWithPosts(stack)

    // Not returned by any load: only the live relation graph owns it.
    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p2', item: { id: 'p2', authorId: 'a1' } })
    stack.cache.garbageCollect()
    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])

    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p2', item: { id: 'p2', authorId: 'nobody' } })
    stack.cache.garbageCollect()
    expect(cached(stack, 'posts', 'p2')).toBeUndefined()
    expect(cached(stack, 'posts', 'p1')).toBeDefined()
    owner.stop()
  })

  it('releases the relation graph of a root that stops matching, keeping shared rows', async () => {
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema: blogSchema })
    for (const id of ['a1', 'a2', 'a3'])
      writeAuthor(stack, id, [])
    const owner = stack.scope(() => stack.store.posts.query((q: any) => q.many({
      fetchPolicy: 'cache-only',
      filter: (post: any) => !post.hidden,
      include: { author: true, editor: true },
      experimentalGarbageCollection: false,
    })))
    const query = await owner.result
    // Posts arrive after loading, so only the live graph owns them; a3 edits both.
    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p1', item: { id: 'p1', authorId: 'a1', editorId: 'a3' } })
    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p2', item: { id: 'p2', authorId: 'a2', editorId: 'a3' } })
    stack.cache.garbageCollect()
    expect(query.data.value.map((post: any) => post.id)).toEqual(['p1', 'p2'])

    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p1', item: { id: 'p1', authorId: 'a1', editorId: 'a3', hidden: true } })
    stack.cache.garbageCollect()
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    expect(cached(stack, 'authors', 'a3')).toBeDefined()
    expect(cached(stack, 'authors', 'a2')).toBeDefined()
    owner.stop()
  })

  it('keeps a related row retained when its optimistic layer is replaced by the base write', async () => {
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema: blogSchema })
    writeAuthor(stack, 'a1', ['p1'])
    const { owner, query } = await openAuthorsWithPosts(stack)
    stack.cache.addLayer({ id: 'create', collectionName: 'posts', state: { p2: { id: 'p2', authorId: 'a1' } }, deletedItems: new Set() })
    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])

    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p2', item: { id: 'p2', authorId: 'a1' } })
    stack.cache.removeLayer('create')
    stack.cache.garbageCollect()
    expect(cached(stack, 'posts', 'p2')).toBeDefined()
    expect(query.data.value[0].posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])
    owner.stop()
  })

  it('releases the whole visible graph when the query stops', async () => {
    const stack = await createGarbageCollectionStack({ remote: false, experimentalGarbageCollection: true, schema: blogSchema })
    writeAuthor(stack, 'a1', ['p1', 'p2'])
    const { owner } = await openAuthorsWithPosts(stack)
    stack.cache.writeItem({ collection: stack.collection('posts'), key: 'p3', item: { id: 'p3', authorId: 'a1' } })
    stack.cache.garbageCollect()
    expect(cached(stack, 'posts', 'p3')).toBeDefined()

    owner.stop()
    await drainGarbageCollection()
    stack.cache.garbageCollect()
    expect(cached(stack, 'authors', 'a1')).toBeUndefined()
    expect(cached(stack, 'posts', 'p1')).toBeUndefined()
    expect(cached(stack, 'posts', 'p3')).toBeUndefined()
  })
})
