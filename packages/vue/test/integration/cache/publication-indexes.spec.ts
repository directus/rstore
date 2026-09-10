import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it } from 'vitest'
import { watchSyncEffect } from 'vue'

describe('cache writeItems', () => {
  it('publishes a multi-result applyMutation once to a warmed reader', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    expect(cache.readItems({ collection })).toEqual([])
    const observedLengths: number[] = []
    const stop = watchSyncEffect(() => {
      observedLengths.push(cache.readItems({ collection }).length)
    })

    try {
      const result = cache.applyMutation({
        collection,
        mutation: 'create',
        results: [
          { id: 1, name: 'First' },
          { id: 2, name: 'Second' },
        ],
      })

      expect(result).toEqual({ written: [1, 2], deleted: [], skipped: 0 })
      expect(observedLengths).toEqual([0, 2])
    }
    finally {
      stop()
    }
  })

  it('publishes index changes once after the batch is complete', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'Author',
          relations: {
            posts: { to: { Post: { on: { authorId: 'id' } } }, many: true },
          },
        },
        { name: 'Post' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const postCollection = store.$collections.find(collection => collection.name === 'Post')!
    cache.writeItem({ collection: postCollection, key: 1, item: { id: 1, title: 'First', authorId: 'a1' } })
    const observedIds: number[][] = []
    const stop = watchSyncEffect(() => {
      observedIds.push(cache.readItems({
        collection: postCollection,
        indexKey: 'authorId',
        indexValue: 'a1',
      }).map(item => item.id))
    })

    try {
      cache.writeItems({
        collection: postCollection,
        items: [
          { key: 1, value: { authorId: 'a2' } },
          { key: 2, value: { id: 2, title: 'Second', authorId: 'a1' } },
        ],
      })

      expect(observedIds).toEqual([[1], [2]])
    }
    finally {
      stop()
    }
  })
})
