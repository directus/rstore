import { describe, expect, it } from 'vitest'
import { watchEffect } from 'vue'
import { blogSchema, cached, createGarbageCollectionStack, drainGarbageCollection } from './utils'

/** Rows released at once by the ended query. */
const RELEASED_COUNT = 50

/** Build author rows plus one post whose author stays owned by the observer. */
function blogData() {
  const authors = Array.from({ length: RELEASED_COUNT }, (_, index) => ({ id: `a${index}`, name: `Author ${index}` }))
  return {
    authors: [...authors, { id: 'kept', name: 'Kept' }],
    posts: [{ id: 'p1', authorId: 'kept' }],
  }
}

/** Observer shapes that must not re-read once per released row. */
const observers = [
  {
    name: 'non-collecting cache-only list',
    collection: 'authors',
    options: { experimentalGarbageCollection: false, fetchPolicy: 'cache-only' },
    ids: ['kept'],
  },
  {
    name: 'collecting list with an included relation',
    collection: 'posts',
    options: { experimentalGarbageCollection: true, fetchPolicy: 'fetch-only', include: { author: true } },
    ids: ['p1'],
  },
] as const

describe('released query collection batching', () => {
  it.each(observers)('re-reads a $name a bounded number of times when an ended query releases many rows', async (observerCase) => {
    const stack = await createGarbageCollectionStack({ schema: blogSchema, data: blogData() })
    const ended = stack.scope(() => stack.store.authors.query((q: any) => q.many({
      experimentalGarbageCollection: true,
      fetchPolicy: 'fetch-only',
    })))
    await ended.result

    let observerReads = 0
    // Count cache reads of the observer query only, through its own filter.
    const observerFilter = (item: any) => (observerCase.ids as readonly string[]).includes(item.id)
    stack.store.$hooks.hook('cacheFilterMany', (payload: any) => {
      if (payload.findOptions?.filter === observerFilter) {
        observerReads++
      }
    })
    const observer = await stack.run(() => (stack.store as any)[observerCase.collection].query((q: any) => q.many({
      ...observerCase.options,
      filter: observerFilter,
    })))
    stack.run(() => watchEffect(() => {
      void observer.data.value.length
    }))
    await drainGarbageCollection()
    const readsBeforeRelease = observerReads

    ended.stop()
    await drainGarbageCollection()

    expect(cached(stack, 'authors', 'a0')).toBeUndefined()
    expect(cached(stack, 'authors', `a${RELEASED_COUNT - 1}`)).toBeUndefined()
    expect(cached(stack, 'authors', 'kept')).toBeDefined()
    expect(observer.data.value.map((item: any) => item.id)).toEqual(observerCase.ids)
    // One collection batch, not one cache publication per released row.
    expect(observerReads - readsBeforeRelease).toBeLessThanOrEqual(3)
  })
})
