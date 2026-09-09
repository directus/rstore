import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { runInTestScope } from '#test-utils/store/vueApp'
import { describe, expect, it } from 'vitest'

describe('query pagination', () => {
  it('should reuse existing indexed pages with getPage and track completion', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => [
              { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
              { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
            ],
          },
        },
      ],
      plugins: [],
    })

    const query = await runInTestScope(() => store.messages.query(q => q.many({
      pageIndex: 0,
    })))

    expect(query.mainPage.completed).toBe(true)

    const page = query.getPage({
      pageIndex: 1,
    })

    expect(page.completed).toBe(false)
    expect(query.pages.value[1]).toBe(page)
    expect(query.getPage({ pageIndex: 1 })).toBe(page)

    const fetchMorePromise = query.fetchMore({
      pageIndex: 1,
    })

    expect(fetchMorePromise.page).toBe(page)

    await fetchMorePromise

    expect(page.completed).toBe(true)
    expect(page.data.map(message => message.text)).toEqual([
      'Message 3',
      'Message 4',
    ])
  })

  it('reuses the main page through getPage and fetchMore', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 'message1', text: 'Message 1' },
            ],
          },
        },
      ],
      plugins: [],
    })

    const query = await runInTestScope(() => store.messages.query(q => q.many({
      pageIndex: 0,
    })))

    const page = query.getPage({
      pageIndex: 0,
    })

    expect(page).toBe(query.mainPage)
    expect(query.pages.value[0]).toBe(query.mainPage)

    const fetchMorePromise = query.fetchMore({
      pageIndex: 0,
    })

    expect(fetchMorePromise.page).toBe(query.mainPage)
    expect(query.pages.value[0]).toBe(query.mainPage)

    await fetchMorePromise

    expect(query.mainPage.data.map(message => message.text)).toEqual([
      'Message 1',
    ])
  })

  it('should refetch the other pages on refresh', async () => {
    const fetchedPageIndexes: Array<number | undefined> = []
    let revision = 1

    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => {
              fetchedPageIndexes.push(pageIndex)
              return [
                { id: `message${pageIndex}`, text: `Message ${pageIndex} rev${revision}` },
              ]
            },
          },
        },
      ],
      plugins: [],
    })

    const query = await runInTestScope(() => store.messages.query(q => q.many({
      pageIndex: 0,
    })))
    const { page } = await query.fetchMore({
      pageIndex: 1,
    })

    revision = 2
    fetchedPageIndexes.length = 0
    await query.refresh()

    // The page is the same object, refetched: whatever the refresh resets, it also loads again.
    expect(query.pages.value[1]).toBe(page)
    expect(fetchedPageIndexes).toEqual([0, 1])
    expect(page.completed).toBe(true)
    expect(page.data.map(message => message.text)).toEqual([
      'Message 1 rev2',
    ])
  })
})
