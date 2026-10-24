import type { VueStack } from '#test-utils/store/vueStack'
// eslint-disable-next-line no-restricted-imports -- Index buckets have no public view; all behavior uses public APIs.
import type { VueCachePrivate } from '../../../src/cache'
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { blogSchema, createGarbageCollectionStack } from './utils'

/** Count relation index buckets of `comments.postId`, which no public API exposes. */
function countPostIdBuckets(stack: VueStack): number {
  // eslint-disable-next-line no-restricted-syntax -- Index buckets have no public view; their count is the leak.
  return (stack.cache as typeof stack.cache & VueCachePrivate)._private.state.collectionIndexes.get('comments')?.get('postId')?.size ?? 0
}

describe('relation index buckets', () => {
  it('drops emptied buckets while relation reads stay reactive', async () => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, remote: false })
    const posts = stack.collection('posts')
    const comments = stack.collection('comments')
    stack.cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1' } })
    const commentIds = computed(() => stack.read('posts', 'p1')!.comments.map((comment: any) => comment.id))
    expect(commentIds.value).toEqual([])

    for (let cycle = 0; cycle < 40; cycle++) {
      const postId = cycle % 2 === 0 ? 'p1' : `missing-${cycle}`
      const key = `c${cycle}`
      if (cycle % 4 < 2) {
        stack.cache.writeItem({ collection: comments, key, item: { id: key, postId } })
      }
      else {
        stack.cache.writeItems({ collection: comments, items: [{ key, value: { id: key, postId } }] })
      }
      expect(commentIds.value).toEqual(postId === 'p1' ? [key] : [])
      // Moving the comment empties its first bucket.
      stack.cache.writeItem({ collection: comments, key, item: { id: key, postId: `moved-${cycle}` } })
      expect(commentIds.value).toEqual([])
      stack.cache.deleteItem({ collection: comments, key })
    }

    expect(countPostIdBuckets(stack)).toBe(0)
  })
})
