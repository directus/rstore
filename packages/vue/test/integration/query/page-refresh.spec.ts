import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { runInTestScope } from '#test-utils/store/vueApp'
import { until } from '@vueuse/core'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

describe('query pagination', () => {
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

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        pageIndex: 0,
      })))
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

    const query = await runInTestScope(() => store.messages.query(q => q.many({
      pageIndex: 0,
    })))
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

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        pageIndex: 0,
      })))
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

    const query = await runInTestScope(() => store.messages.query(q => q.many({
      pageIndex: 0,
      params: { search: search.value },
    })))
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
