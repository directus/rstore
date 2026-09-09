import { afterEach, describe, expect, it, vi } from 'vitest'
import { setup } from '../../utils/query'

describe('query', () => {
  afterEach(() => {
    // The stacks stop their own effect scopes; the globals are ours to restore.
    vi.unstubAllGlobals()
  })

  describe('pagination', () => {
    it('should load more items with fetchMore', async () => {
      const fetchMessages = (pageIndex?: number) => {
        return [
          { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
          { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
        ]
      }
      const { store, run } = await setup([
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
          },
        },
      ])

      const query = await run(() => store.messages.query((q: any) => q.many({
        pageIndex: 0,
      })))

      expect(query.data.value?.length).toBe(2)

      await query.fetchMore({
        pageIndex: 1,
      })

      expect(query.data.value?.length).toBe(4)
      expect(query.data.value?.[0]?.text).toBe('Message 1')
      expect(query.data.value?.[1]?.text).toBe('Message 2')
      expect(query.data.value?.[2]?.text).toBe('Message 3')
      expect(query.data.value?.[3]?.text).toBe('Message 4')
    })

    it('should load pages independently', async () => {
      const fetchMessages = (pageIndex?: number) => {
        return [
          { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
          { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
        ]
      }
      const { store, run } = await setup([
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
          },
        },
      ])

      const query = await run(() => store.messages.query((q: any) => q.many({
        pageIndex: 0,
      })))

      expect(query.pages.value[0]?.data.length).toBe(2)
      expect(query.pages.value[0]?.data[0]?.text).toBe('Message 1')
      expect(query.pages.value[0]?.data[1]?.text).toBe('Message 2')

      const { page: page2 } = await query.fetchMore({
        pageIndex: 1,
      })

      expect(page2.data.length).toBe(2)
      expect(page2.data[0]?.text).toBe('Message 3')
      expect(page2.data[1]?.text).toBe('Message 4')

      expect(query.pages.value[0]?.data.length).toBe(2)
      expect(query.pages.value[0]?.data[0]?.text).toBe('Message 1')
      expect(query.pages.value[0]?.data[1]?.text).toBe('Message 2')
      expect(query.pages.value[1]?.data.length).toBe(2)
      expect(query.pages.value[1]?.data[0]?.text).toBe('Message 3')
      expect(query.pages.value[1]?.data[1]?.text).toBe('Message 4')

      const { page: page4 } = await query.fetchMore({
        pageIndex: 3,
      })

      expect(page4.data.length).toBe(2)
      expect(page4.data[0]?.text).toBe('Message 7')
      expect(page4.data[1]?.text).toBe('Message 8')

      expect(query.pages.value[0]?.data.length).toBe(2)
      expect(query.pages.value[0]?.data[0]?.text).toBe('Message 1')
      expect(query.pages.value[0]?.data[1]?.text).toBe('Message 2')
      expect(query.pages.value[1]?.data.length).toBe(2)
      expect(query.pages.value[1]?.data[0]?.text).toBe('Message 3')
      expect(query.pages.value[1]?.data[1]?.text).toBe('Message 4')
      expect(query.pages.value[2]).toBeUndefined()
      expect(query.pages.value[3]?.data.length).toBe(2)
      expect(query.pages.value[3]?.data[0]?.text).toBe('Message 7')
      expect(query.pages.value[3]?.data[1]?.text).toBe('Message 8')
    })

    it('should update the page loading property', async () => {
      const fetchMessages = (pageIndex?: number) => {
        return [
          { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
          { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
        ]
      }
      const { store, run } = await setup([
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
          },
        },
      ])

      const query = await run(() => store.messages.query((q: any) => q.many({
        pageIndex: 0,
        pageSize: 2,
      })))

      expect(query.pages.value[0]?.loading).toBe(false)

      const fetchMorePromise = query.fetchMore({
        pageIndex: 1,
      })

      const { page } = fetchMorePromise
      expect(page.loading).toBe(true)

      await fetchMorePromise

      expect(page.loading).toBe(false)
      expect(page.data.length).toBe(2)
    })

    it('should reactively compute the first consecutive pages', async () => {
      const fetchMessages = (pageIndex?: number) => {
        switch (pageIndex) {
          case 0:
            return [
              { id: `message1`, text: `Message 1` },
              { id: `message2`, text: `Message 2` },
            ]
          case 1:
            return [
              { id: `message3`, text: `Message 3` },
            ]
          default:
            return []
        }
      }
      const { store, run } = await setup([
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
            create: ({ item }) => item,
          },
        },
      ])

      const query = await run(() => store.messages.query((q: any) => q.many({
        pageIndex: 0,
        pageSize: 2,
      })))

      expect(query.pages.value[0]?.data.length).toBe(2)
      expect(query.pages.value[0]?.data[0]?.text).toBe('Message 1')
      expect(query.pages.value[0]?.data[1]?.text).toBe('Message 2')

      await query.fetchMore({
        pageIndex: 1,
      })

      expect(query.pages.value[1]?.data.length).toBe(1)
      expect(query.pages.value[1]?.data[0]?.text).toBe('Message 3')

      await store.messages.create({
        id: 'newMessage',
        text: 'New Message',
      })

      expect(query.pages.value[1]?.data.length).toBe(2)
      expect(query.pages.value[1]?.data[0]?.text).toBe('Message 3')
      expect(query.pages.value[1]?.data[1]?.text).toBe('New Message')
    })

    it('should preserve fetch response order with responseRefs', async () => {
      const { store, run } = await setup([
        {
          name: 'messages',
          hooks: {
            fetchMany: ({ pageIndex }) => {
              switch (pageIndex) {
                case 0:
                  return [
                    { id: 'message2', text: 'Message 2' },
                    { id: 'message1', text: 'Message 1' },
                  ]
                case 1:
                  return [
                    { id: 'message4', text: 'Message 4' },
                    { id: 'message3', text: 'Message 3' },
                  ]
                default:
                  return []
              }
            },
          },
        },
      ])

      const query = await run(() => store.messages.query((q: any) => q.many({
        pageIndex: 0,
        pageSize: 2,
        resultMode: 'responseRefs',
        fetchPolicy: 'fetch-only',
      })))

      expect(query.data.value.map((item: any) => item.id)).toEqual(['message2', 'message1'])
      expect(query.pages.value[0]?.data.map((item: any) => item.id)).toEqual(['message2', 'message1'])

      await query.fetchMore({
        pageIndex: 1,
      })

      expect(query.data.value.map((item: any) => item.id)).toEqual(['message2', 'message1', 'message4', 'message3'])
      expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['message4', 'message3'])

      store.$cache.writeItem({
        collection: store.$collections[0]!,
        key: 'message1',
        item: { id: 'message1', text: 'Updated Message 1' },
      })

      expect(query.data.value.map((item: any) => item.text)).toEqual(['Message 2', 'Updated Message 1', 'Message 4', 'Message 3'])

      store.$cache.writeItem({
        collection: store.$collections[0]!,
        key: 'message5',
        item: { id: 'message5', text: 'Message 5' },
      })

      expect(query.data.value.map((item: any) => item.id)).toEqual(['message2', 'message1', 'message4', 'message3'])
      expect(query.pages.value[1]?.data.map((item: any) => item.id)).toEqual(['message4', 'message3'])
    })
  })
})
