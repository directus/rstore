import type { CustomHookMeta } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real live queries and fetch lanes; only remote failure/delivery is scripted.
// A push repairs its page, while another failed page must remain observable.
describe('pushed page results preserve other page failures', () => {
  it.each(['foreground', 'background'] as const)('keeps the latest %s failure when pages reuse one Error', async (lane) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      fetchPolicy: lane === 'background' ? 'cache-and-fetch' : 'no-cache',
    }), { pages: 'all' }))
    await query.background.promise
    const { page } = await query.fetchMore({ pageIndex: 1 })
    await page.background.promise
    const main = await subscription(payloads)
    const second = await subscription(payloads, 1)
    const failure = new Error('Shared provider failure')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const pageIndex of [1, 0]) {
        remote.failNext('fetchMany', failure)
        if (lane === 'background') {
          await query.fetchMore({ pageIndex })
          await query.pages.value[pageIndex].background.promise
        }
        else {
          await query.refresh({ pages: [pageIndex] })
        }
      }
    }
    finally {
      consoleError.mockRestore()
    }
    expect(query.mainPage[lane].error).toBe(failure)
    expect(query[lane].error.value).toBe(failure)

    expect(second.setResult!([{ id: '2', title: 'Two' }])).toBe('applied')
    await vi.waitFor(() => expect(page[lane].error).toBeNull())
    expect(page.data).toEqual([{ id: '2', title: 'Two' }])
    expect(page.error).toBeNull()
    expect(query.mainPage[lane].error).toBe(failure)
    expect(query[lane].error.value).toBe(failure)
    expect(query.error.value).toBe(failure)

    expect(main.setResult!([{ id: '1', title: 'One' }])).toBe('applied')
    expect(query.mainPage.error).toBeNull()
    expect(query[lane].error.value).toBeNull()
    expect(query.error.value).toBeNull()
  })

  it('preserves a background failure until the failed page receives a push', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const failure = new Error('Background page failed')
    remote.failNext('fetchMany', failure)
    const release = remote.holdNext('fetchMany')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      fetchPolicy: 'cache-and-fetch',
    }), { pages: 'all' }))
    try {
      await query
      query.getPage({ pageIndex: 1 })
      await subscription(payloads, 1)
    }
    finally {
      release()
      await query.background.promise
      consoleError.mockRestore()
    }
    const main = await subscription(payloads)
    const second = await subscription(payloads, 1)
    expect(query.background.error.value).toBe(failure)
    expect(second.setResult!([], { meta: { secondaryPublished: true } as CustomHookMeta })).toBe('applied')
    await vi.waitFor(() => expect(query.meta.value.secondaryPublished).toBe(true))
    expect(query.mainPage.background.error).toBe(failure)
    expect(query.background.error.value).toBe(failure)
    expect(query.error.value).toBe(failure)

    expect(main.setResult!([])).toBe('applied')
    expect(query.mainPage.background.error).toBeNull()
    expect(query.background.error.value).toBeNull()
    expect(query.error.value).toBeNull()
  })

  it.each([false, true])('preserves another page failure and its dismissal (%s)', async (dismiss) => {
    const { store, run, remote, payloads } = await setupLiveTodos()
    const query = await run(() => store.todos.liveQuery((q: any) => q.many({
      pageSize: 1,
      fetchPolicy: 'no-cache',
    }), { pages: 'all' }))
    await query.fetchMore({ pageIndex: 1 })
    const main = await subscription(payloads)
    const second = await subscription(payloads, 1)
    const failure = new Error('Main page failed')
    remote.failNext('fetchMany', failure)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await main.refresh!()
    }
    finally {
      consoleError.mockRestore()
    }
    expect(query.mainPage.error).toBe(failure)
    expect(query.error.value).toBe(failure)
    if (dismiss)
      query.error.value = null

    expect(second.setResult!([{ id: '2', title: 'Pushed two' }])).toBe('applied')
    await vi.waitFor(() => expect(query.pages.value[1].data).toEqual([{ id: '2', title: 'Pushed two' }]))
    expect(query.mainPage.error).toBe(failure)
    expect(query.foreground.error.value).toBe(dismiss ? null : failure)
    expect(query.error.value).toBe(dismiss ? null : failure)

    expect(main.setResult!([{ id: '1', title: 'Recovered one' }])).toBe('applied')
    expect(query.mainPage.error).toBeNull()
    expect(query.foreground.error.value).toBeNull()
    expect(query.error.value).toBeNull()
    expect(query.data.value).toEqual([
      { id: '1', title: 'Recovered one' },
      { id: '2', title: 'Pushed two' },
    ])
  })
})
