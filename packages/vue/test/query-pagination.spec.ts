import { until } from '@vueuse/core'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
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

    const query = await store.messages.query(q => q.many({
      pageIndex: 0,
    }))
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

  it('should keep a failed page reporting its error across a refresh', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      let failing = true

      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => {
                if (pageIndex === 1 && failing) {
                  throw new Error('Page fetch failed')
                }
                return [
                  { id: `message${pageIndex}`, text: `Message ${pageIndex}` },
                ]
              },
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
      }))
      const { page } = await query.fetchMore({
        pageIndex: 1,
      })

      expect(page.error?.message).toBe('Page fetch failed')

      await query.refresh()

      // Re-attempted and failed again, so the failure is still the page's current state instead of
      // being cleared by a refresh that never touched the page.
      expect(query.pages.value[1]).toBe(page)
      expect(page.error?.message).toBe('Page fetch failed')

      failing = false
      await query.refresh()

      expect(page.error).toBe(null)
      expect(page.data.map(message => message.text)).toEqual([
        'Message 1',
      ])
    }
    finally {
      consoleError.mockRestore()
    }
  })

  it('should only reload the pages listed in the refresh options', async () => {
    const fetchedPageIndexes: Array<number | undefined> = []

    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => {
              fetchedPageIndexes.push(pageIndex)
              return [
                { id: `message${pageIndex}`, text: `Message ${pageIndex}` },
              ]
            },
          },
        },
      ],
      plugins: [],
    })

    const query = await store.messages.query(q => q.many({
      pageIndex: 0,
    }))
    const { page } = await query.fetchMore({
      pageIndex: 1,
    })

    fetchedPageIndexes.length = 0
    await query.refresh({ pages: [0] })

    // Left out, so untouched: still there, still holding what its own load produced.
    expect(fetchedPageIndexes).toEqual([0])
    expect(query.pages.value[1]).toBe(page)
    expect(page.completed).toBe(true)
    expect(page.data.map(message => message.text)).toEqual([
      'Message 1',
    ])

    fetchedPageIndexes.length = 0
    await query.refresh({ pages: [] })

    expect(fetchedPageIndexes).toEqual([])
    expect(query.pages.value[0]).toBe(query.mainPage)
    expect(query.pages.value[1]).toBe(page)
    expect(query.mainPage.completed).toBe(true)
  })

  it('should keep the error of a failed page a selective refresh leaves out', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => {
                if (pageIndex === 1) {
                  throw new Error('Page fetch failed')
                }
                return [
                  { id: `message${pageIndex}`, text: `Message ${pageIndex}` },
                ]
              },
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
      }))
      const { page } = await query.fetchMore({
        pageIndex: 1,
      })

      await query.refresh({ pages: [0] })

      expect(page.error?.message).toBe('Page fetch failed')
      expect(page.completed).toBe(true)
    }
    finally {
      consoleError.mockRestore()
    }
  })

  it('should drop the other pages when the query options change', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex, params }) => [
              { id: `message${pageIndex}-${(params as { search: string }).search}`, text: `Message ${pageIndex}` },
            ],
          },
        },
      ],
      plugins: [],
    })

    const search = ref('a')

    const query = await store.messages.query(q => q.many({
      pageIndex: 0,
      params: { search: search.value },
    }))
    await query.fetchMore({
      pageIndex: 1,
    })

    search.value = 'b'
    await nextTick()
    await until(() => query.loading.value).toBe(false)

    // A different query: the pages of the previous one are meaningless.
    expect(query.pages.value[1]).toBeUndefined()
  })
})
