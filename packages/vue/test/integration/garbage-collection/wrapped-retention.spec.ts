import type { Plugin } from '@rstore/shared'
import { expectReleased } from '#test-utils/gc'
import { describe, expect, it } from 'vitest'
import { blogSchema, cached, createGarbageCollectionStack, todoSchema } from './utils'

/** Capture each fetched response object exactly as the cache receives it. */
function captureResponses(responses: Array<WeakRef<object>>): Plugin {
  return {
    name: 'capture-responses',
    setup({ hook }) {
      hook('afterFetch', ({ getResult }) => {
        const result = getResult()
        if (result && typeof result === 'object') {
          responses.push(new WeakRef(result))
        }
      })
    },
  }
}

describe('wrapped item retention', () => {
  it('releases the raw response and its nested children while the row stays cached', async () => {
    const responses: Array<WeakRef<object>> = []
    const stack = await createGarbageCollectionStack({
      schema: blogSchema,
      data: {
        posts: [{ id: 'p1', title: 'Post', comments: [{ id: 'c1', postId: 'p1' }, { id: 'c2', postId: 'p1' }] }],
      },
      plugins: [captureResponses(responses)],
    })

    /** Keep the response out of this test's frames while asserting its release. */
    async function load() {
      const query = await stack.run(() => stack.store.posts.query((q: any) => q.first({ key: 'p1', fetchPolicy: 'fetch-only' })))
      expect(query.data.value.comments.map((comment: any) => comment.id)).toEqual(['c1', 'c2'])
      const deletedChild = new WeakRef<object>((responses[0]!.deref() as any).comments[0])
      stack.cache.deleteItem({ collection: stack.collection('comments'), key: 'c1' })
      expect(query.data.value.comments.map((comment: any) => comment.id)).toEqual(['c2'])
      await query.refresh()
      return { query, deletedChild }
    }

    const { query, deletedChild } = await load()
    await expectReleased(responses[0]!)
    await expectReleased(deletedChild)
    expect(cached(stack, 'posts', 'p1')?.title).toBe('Post')
    expect(query.data.value.title).toBe('Post')
  })

  it('forgets wrappers of rows whose paused write was dropped', async () => {
    const responses: Array<WeakRef<object>> = []
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: '1', title: 'Never written' }] },
      plugins: [captureResponses(responses)],
    })

    /** Load a query while writes are paused, then unmount it before they flush. */
    async function visit() {
      stack.cache.pause()
      const mounted = stack.scope(() => stack.store.todos.query((q: any) => q.many({ fetchPolicy: 'fetch-only' })))
      await mounted.result
      // The wrapper registered for the unwritten row is the only cache holder of its raw value.
      const row = new WeakRef<object>((responses[0]!.deref() as any)[0])
      mounted.stop()
      stack.cache.resume()
      return row
    }

    const row = await visit()
    expect(cached(stack, 'todos', '1')).toBeUndefined()
    await expectReleased(row)
  })

  it('sweeps wrappers of never-written rows on garbage collection', async () => {
    const stack = await createGarbageCollectionStack({ schema: todoSchema, remote: false })

    /** Wrap a row through the public API without ever writing it. */
    function wrap() {
      const item = { id: '1', title: 'Never written' }
      stack.cache.wrapItem({ collection: stack.collection('todos'), item })
      return new WeakRef<object>(item)
    }

    const row = wrap()
    stack.cache.garbageCollect()
    await expectReleased(row)
  })
})
