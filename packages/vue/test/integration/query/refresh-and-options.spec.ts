import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

describe('query', () => {
  it('should handle fetch errors', async () => {
    const { store, run, remote, readMany } = await createVueStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: 'foo', text: 'Initial' }] },
    })
    remote.failNext('fetchMany', new Error('Fetch failed'))

    const query = await run(() => store.messages.query((q: any) => q.many({
      fetchPolicy: 'no-cache',
    })))

    expect(query.error.value?.message).toBe('Fetch failed')
    expect(query.data.value).toEqual([])
    expect(query.loading.value).toBe(false)
    expect(readMany('messages')).toEqual([])
  })

  it('should refresh data when refresh is called', async () => {
    const { store, run, remote } = await createVueStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: 'foo', text: 'initial' }] },
    })

    const query = await run(() => store.messages.query((q: any) => q.first('foo')))

    expect(query.data.value?.text).toBe('initial')

    remote.seed('messages', [{ id: 'foo', text: 'refreshed' }])

    await query.refresh()

    expect(query.data.value).toMatchObject({ id: 'foo', text: 'refreshed' })
    expect(query.loading.value).toBe(false)
    expect(query.error.value).toBeNull()
  })

  it('should refresh data when options change', async () => {
    const { store, run, remote } = await createVueStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: 'foo', text: 'foo' }, { id: 'bar', text: 'bar' }] },
    })

    const key = ref('foo')

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: key.value,
    })))

    expect(query.data.value?.text).toBe('foo')

    key.value = 'bar'
    await nextTick()
    expect(query.loading.value).toBe(true)
    await vi.waitFor(() => expect(query.loading.value).toBe(false))

    expect(query.data.value).toMatchObject({ id: 'bar', text: 'bar' })
    expect(remote.lastRequest('fetchFirst')).toMatchObject({ collection: 'messages', key: 'bar' })
    expect(query.error.value).toBeNull()
  })

  it('should not load data when query is disabled, including explicit refresh', async () => {
    const { store, run, remote, readMany } = await createVueStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: 'foo', text: 'Private message' }, { id: 'bar', text: 'Other message' }] },
    })

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: 'foo',
      enabled: false,
    })))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)
    await query.refresh()
    expect(remote.requests('fetchFirst')).toEqual([])
    expect(query.error.value).toBeNull()
    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)
    expect(readMany('messages')).toEqual([])
  })

  it('should re-enable query by setting option to object', async () => {
    const { store, run, remote, read } = await createVueStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: 'bar', text: 'Other message' }, { id: 'foo', text: 'from network' }] },
    })

    const options = ref<any>({ enabled: false })

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: 'foo',
      ...options.value,
    })))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)
    expect(remote.requests('fetchFirst')).toEqual([])

    options.value = {}

    await nextTick()

    expect(query.loading.value).toBe(true)
    await vi.waitFor(() => expect(query.loading.value).toBe(false))

    expect(remote.requests('fetchFirst')).toHaveLength(1)
    expect(remote.lastRequest('fetchFirst')).toMatchObject({ collection: 'messages', key: 'foo' })
    expect(query.data.value).toMatchObject({ id: 'foo', text: 'from network' })
    expect(query.error.value).toBeNull()
    expect(read('messages', 'foo')).toMatchObject({ id: 'foo', text: 'from network' })
    expect(read('messages', 'bar')).toBeUndefined()
  })
})
