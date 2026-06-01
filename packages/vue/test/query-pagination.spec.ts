import { describe, expect, it } from 'vitest'
import { createStore } from '../src/store'

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

    const query = await store.messages.query(q => q.many({
      pageIndex: 0,
    }))

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

  it('should reuse the main page when its page slot is temporarily empty', async () => {
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

    const query = await store.messages.query(q => q.many({
      pageIndex: 0,
    }))

    query.pages.value = []

    const page = query.getPage({
      pageIndex: 0,
    })

    expect(page).toBe(query.mainPage)
    expect(query.pages.value[0]).toBe(query.mainPage)

    query.pages.value = []

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
})
