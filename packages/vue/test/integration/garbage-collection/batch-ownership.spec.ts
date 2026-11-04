import { describe, expect, it } from 'vitest'
import { watch } from 'vue'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

describe('relation ownership during cache batches', () => {
  it.each([true, false])('updates included rows with bounded identity reads (collection: %s)', async (collect) => {
    let keyReads = 0
    const stack = await createGarbageCollectionStack({
      remote: false,
      schema: blogSchema.map(collection => 'name' in collection && collection.name === 'posts'
        ? {
            ...collection,
            /** Observe real traversal through the public collection key resolver. */
            getKey: (item: { id: string }) => {
              keyReads++
              return item.id
            },
          }
        : collection),
    })
    const size = 128
    stack.store.authors.writeItem({ id: 'a1' })
    const rows = Array.from({ length: size }, (_, index) => ({ id: `p${index}`, authorId: 'a1', text: 'before' }))
    stack.cache.writeItems({ collection: stack.collection('posts'), items: rows.map(value => ({ key: value.id, value })) })
    const owner = stack.scope(() => stack.store.authors.query((q: any) => q.first({
      key: 'a1',
      fetchPolicy: 'cache-only',
      include: { posts: true },
      experimentalGarbageCollection: collect,
    })))
    const query = await owner.result
    await drainGarbageCollection()
    expect(query.data.value.posts).toHaveLength(size)
    keyReads = 0

    // One committed batch changes every retained row and connects two new rows.
    // Rebuilding the whole included graph once per row made deck lists freeze.
    stack.cache.writeItems({
      collection: stack.collection('posts'),
      items: [
        ...rows.map(row => ({ key: row.id, value: { ...row, text: 'after' } })),
        { key: 'new1', value: { id: 'new1', authorId: 'a1', text: 'added1' } },
        { key: 'new2', value: { id: 'new2', authorId: 'a1', text: 'added2' } },
      ],
    })
    // A generous linear bound avoids wall-clock assertions while rejecting
    // a full ownership traversal for each changed item in this batch.
    expect(keyReads).toBeLessThan(size * 12)

    // Adoption remains synchronous: a sweep before Vue's next tick must keep
    // every newly visible child, not only the already-owned rows.
    stack.cache.garbageCollect()
    expect(query.data.value.posts.map((post: any) => [post.id, post.text])).toEqual([
      ...Array.from({ length: size }, (_, index) => [`p${index}`, 'after']),
      ['new1', 'added1'],
      ['new2', 'added2'],
    ])
    expect(cached(stack, 'posts', 'new1')?.text).toBe('added1')
    expect(cached(stack, 'posts', 'new2')?.text).toBe('added2')

    owner.stop()
    await drainGarbageCollection()
    stack.cache.garbageCollect()
    expect(stack.store.authors.peekMany()).toEqual([])
    expect(stack.store.posts.peekMany()).toEqual([])
  })

  it.each(['all', 'item'] as const)('adopts new relations before a sync subscriber collects %s', async (mode) => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, remote: false })
    stack.store.authors.writeItem({ id: 'a1' })
    const query = await stack.run(() => stack.store.authors.query((q: any) => q.first({
      key: 'a1',
      fetchPolicy: 'cache-only',
      include: { posts: true },
      experimentalGarbageCollection: true,
    })))
    await drainGarbageCollection()
    let swept = false
    stack.run(() => watch(() => query.data.value.posts.length, (length) => {
      if (!length || swept)
        return
      swept = true
      if (mode === 'all')
        stack.cache.garbageCollect()
      else
        stack.cache.garbageCollectItem({ collection: stack.collection('posts'), item: query.data.value.posts[0] })
    }, { flush: 'sync' }))

    stack.cache.writeItems({
      collection: stack.collection('posts'),
      items: [
        { key: 'p1', value: { id: 'p1', authorId: 'a1' } },
        { key: 'p2', value: { id: 'p2', authorId: 'a1' } },
      ],
    })

    expect(swept).toBe(true)
    expect(query.data.value.posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])
    expect(cached(stack, 'posts', 'p1')?.id).toBe('p1')
    expect(cached(stack, 'posts', 'p2')?.id).toBe('p2')
  })
})
