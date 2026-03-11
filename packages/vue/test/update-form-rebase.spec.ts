import { withItemType } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { createStore } from '../src/store'

describe('updateForm realtime rebases', () => {
  it('preserves the current op log after a remote cache write and rebase', async () => {
    const Documents = withItemType<{
      id: number
      title: string
      body: string
      status: 'draft' | 'published'
    }>().defineCollection({
      name: 'documents',
      hooks: {
        fetchFirst: () => ({
          id: 1,
          title: 'Original title',
          body: 'Original body',
          status: 'draft',
        }),
        update: async ({ key, item }) => {
          if (typeof key === 'string') {
            throw new TypeError('Key should be a number')
          }
          return {
            id: key,
            title: 'Original title',
            body: 'Original body',
            status: 'draft',
            ...item,
          }
        },
      },
    })

    const store = await createStore({
      schema: [Documents],
      plugins: [],
    })
    const collection = store.$collections.find(c => c.name === 'documents')!

    const form = await store.documents.updateForm(1)

    form.title = 'Local title'

    expect(form.$opLog.getAll()).toHaveLength(1)

    const currentItem = store.documents.peekFirst(1)
    expect(currentItem).toBeTruthy()

    const newBase = {
      ...currentItem!,
      body: 'Remote body',
    }

    store.$cache.writeItem({
      collection,
      key: 1,
      item: newBase,
    })

    form.$rebase(newBase, ['body'])

    expect(form.title).toBe('Local title')
    expect(form.body).toBe('Remote body')
    expect(form.$opLog.getAll()).toHaveLength(1)
    expect(form.$opLog.canUndo).toBe(true)
    expect(form.$changedProps).toEqual({
      title: ['Local title', 'Original title'],
    })
  })
})
