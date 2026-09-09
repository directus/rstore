import { stubWindow } from '#test-utils/store/windowStub'
import { until } from '@vueuse/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setup } from '../../utils/query'

describe('query', () => {
  afterEach(() => {
    // The stacks stop their own effect scopes; the globals are ours to restore.
    vi.unstubAllGlobals()
  })

  it('should handle fetch errors', async () => {
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchMany: () => {
            throw new Error('Fetch failed')
          },
        },
      },
    ])

    const query = await run(() => store.messages.query((q: any) => q.many({
      fetchPolicy: 'no-cache',
    })))

    expect(query.error.value?.message).toBe('Fetch failed')
  })

  it('should refresh data when refresh is called', async () => {
    let data = { id: 'foo', text: 'initial' }
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchFirst: () => data,
        },
      },
    ])

    const query = await run(() => store.messages.query((q: any) => q.first('foo')))

    expect(query.data.value?.text).toBe('initial')

    data = { id: 'foo', text: 'refreshed' }

    await query.refresh()

    expect(query.data.value?.text).toBe('refreshed')
  })

  it('should refresh data on window focus when enabled', async () => {
    const window = stubWindow()

    let data = { id: 'foo', text: 'initial' }
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchFirst: () => data,
        },
      },
    ], { syncImmediately: false })

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: 'foo',
      fetchOptions: {
        autoRefresh: 'windowFocus',
      },
    })))

    expect(query.data.value?.text).toBe('initial')

    data = { id: 'foo', text: 'focused' }
    window.dispatch('focus')

    await until(() => query.data.value?.text === 'focused').toBe(true)
  })

  it('should refresh data when options change', async () => {
    const data = {
      foo: { id: 'foo', text: 'foo' },
      bar: { id: 'bar', text: 'bar' },
    }
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchFirst: ({ key }) => {
            return data[key as keyof typeof data]
          },
        },
      },
    ])

    const key = ref('foo')

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: key.value,
    })))

    expect(query.data.value?.text).toBe('foo')

    key.value = 'bar'
    await nextTick()
    expect(query.loading.value).toBe(true)
    await until((): boolean => query.loading.value).toBe(false)

    expect(query.data.value?.text).toBe('bar')
  })

  it('should not load data when query is disabled', async () => {
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchFirst: () => {
            throw new Error('Should not be called')
          },
        },
      },
    ])

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: 'foo',
      enabled: false,
    })))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)
  })

  it('should re-enable query by setting option to object', async () => {
    const { store, run } = await setup([
      {
        name: 'messages',
        hooks: {
          fetchFirst: ({ key }) => {
            return { id: key, text: 'from network' }
          },
        },
      },
    ])

    const options = ref<any>({ enabled: false })

    const query = await run(() => store.messages.query((q: any) => q.first({
      key: 'foo',
      ...options.value,
    })))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)

    options.value = {}

    await nextTick()

    expect(query.loading.value).toBe(true)
    await until((): boolean => query.loading.value).toBe(false)

    expect(query.data.value?.text).toBe('from network')
  })
})
