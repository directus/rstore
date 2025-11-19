import { until } from '@vueuse/core'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { createStore } from '../src/store'

describe('store', () => {
  it('should allow using a collection API directly', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 1, text: 'Hello' },
              { id: 2, text: 'World' },
            ],
          },
        },
      ],
      plugins: [],
    })
    const list = await store.messages.findMany()
    expect(list).toHaveLength(2)
    expect(list[0]?.text).toBe('Hello')
    expect(list[1]?.text).toBe('World')
  })

  it('should allow using a collection API from a dynamic collection name', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 1, text: 'Hello' },
              { id: 2, text: 'World' },
            ],
          },
        },
        {
          name: 'posts',
          hooks: {
            fetchMany: () => [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
          },
        },
      ],
      plugins: [],
    })

    {
      const list = await store.$collection('messages').findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.text).toBe('Hello')
      expect(list[1]?.text).toBe('World')
    }

    {
      const list = await store.$collection('posts').findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.title).toBe('Post 1')
      expect(list[1]?.title).toBe('Post 2')
    }
  })

  it('should allow using a collection API from a Ref of a collection name', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 1, text: 'Hello' },
              { id: 2, text: 'World' },
            ],
          },
        },
        {
          name: 'posts',
          hooks: {
            fetchMany: () => [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
          },
        },
      ],
      plugins: [],
    })

    const collectionName = ref('messages')
    const api = store.$collection(collectionName)

    {
      const list = await api.findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.text).toBe('Hello')
      expect(list[1]?.text).toBe('World')
    }

    collectionName.value = 'posts'

    {
      const list = await api.findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.title).toBe('Post 1')
      expect(list[1]?.title).toBe('Post 2')
    }
  })

  it('should allow using a collection API from a getter of a collection name', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 1, text: 'Hello' },
              { id: 2, text: 'World' },
            ],
          },
        },
        {
          name: 'posts',
          hooks: {
            fetchMany: () => [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
          },
        },
      ],
      plugins: [],
    })

    let collectionName = 'messages'
    const api = store.$collection(() => collectionName)

    {
      const list = await api.findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.text).toBe('Hello')
      expect(list[1]?.text).toBe('World')
    }

    collectionName = 'posts'

    {
      const list = await api.findMany()
      expect(list).toHaveLength(2)
      expect(list[0]?.title).toBe('Post 1')
      expect(list[1]?.title).toBe('Post 2')
    }
  })

  it('should refresh the query when the collection name changes', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => [
              { id: 1, text: 'Hello' },
              { id: 2, text: 'World' },
            ],
          },
        },
        {
          name: 'posts',
          hooks: {
            fetchMany: () => [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
          },
        },
      ],
      plugins: [],
    })

    const collectionName = ref('messages')
    const api = store.$collection(collectionName)

    const query = await api.query(q => q.many())

    expect(query.loading.value).toBe(false)
    expect(query.data.value).toHaveLength(2)
    expect((query.data.value[0] as any).text).toBe('Hello')
    expect((query.data.value[1] as any).text).toBe('World')

    collectionName.value = 'posts'
    await nextTick()
    expect(query.loading.value).toBe(true)
    await until(() => query.loading.value === false).toBeTruthy()

    expect(query.loading.value).toBe(false)
    expect(query.data.value).toHaveLength(2)
    expect((query.data.value[0] as any).title).toBe('Post 1')
    expect((query.data.value[1] as any).title).toBe('Post 2')
  })
})
