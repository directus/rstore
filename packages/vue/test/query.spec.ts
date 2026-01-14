import { until } from '@vueuse/core'
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { createStore } from '../src/store'

describe('query', () => {
  describe('cache-first', () => {
    describe('fetchFirst', () => {
      it('should load item from network if not in cache', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchFirst: () => {
                  return { id: 'foo', text: 'from network' }
                },
              },
            },
          ],
          plugins: [],
        })

        const query = await store.messages.query(q => q.first({
          key: 'foo',
          fetchPolicy: 'cache-first',
        }))

        expect(query.data.value?.text).toBe('from network')
      })

      it('should load item from cache if present', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchFirst: () => {
                  return { id: 'foo', text: 'from network' }
                },
              },
            },
          ],
          plugins: [],
        })

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'from cache' },
        })

        const query = await store.messages.query(q => q.first({
          key: 'foo',
          fetchPolicy: 'cache-first',
        }))

        expect(query.data.value?.text).toBe('from cache')
      })
    })

    describe('fetchMany', () => {
      it('should load items from network if not in cache', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  return [
                    { id: 'foo', text: 'from network' },
                    { id: 'bar', text: 'from network' },
                  ]
                },
              },
            },
          ],
          plugins: [],
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'cache-first',
        }))

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')
      })

      it('should load items from cache if present', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  return [
                    { id: 'foo', text: 'from network' },
                    { id: 'bar', text: 'from network' },
                  ]
                },
              },
            },
          ],
          plugins: [],
        })

        // Mark the query as cached
        await store.messages.findMany({
          fetchPolicy: 'cache-first',
        })

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'from cache' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'from cache' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'baz',
          item: { id: 'baz', text: 'from cache' },
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'cache-first',
        }))

        expect(query.data.value?.length).toBe(3)
        expect(query.data.value?.[0]?.text).toBe('from cache')
        expect(query.data.value?.[1]?.text).toBe('from cache')
        expect(query.data.value?.[2]?.text).toBe('from cache')
      })
    })
  })

  describe('no-cache', () => {
    describe('fetchFirst', () => {
      it('should read from network with no cache', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchFirst: () => {
                  return { id: 'foo', text: 'from network' }
                },
              },
            },
          ],
          plugins: [],
        })

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })

        const query = await store.messages.query(q => q.first({
          key: 'foo',
          fetchPolicy: 'no-cache',
        }))

        expect(query.data.value?.text).toBe('from network')
      })
    })

    describe('fetchMany', () => {
      it('should read from network with no cache', async () => {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  return [
                    { id: 'foo', text: 'from network' },
                    { id: 'bar', text: 'from network' },
                  ]
                },
              },
            },
          ],
          plugins: [],
        })

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'cached' },
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'no-cache',
        }))

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'cached' },
        })

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')
      })
    })
  })

  describe('cache-and-fetch', () => {
    it('should update the query meta', async () => {
      const store = await createStore({
        schema: [
          {
            name: 'messages',
          },
        ],
        plugins: [],
      })

      store.$hooks.hook('fetchMany', ({ meta, setResult }) => {
        const anyMeta = meta as any
        anyMeta.meow = 'waf'
        setResult([{ id: '1', text: 'hello' }])
      })

      const query = await store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
        meta: { meow: 'meow' } as any,
      }))

      await until(() => query.data.value.length).toBe(1)

      await Promise.resolve()

      expect((query.meta.value as any).meow).toBe('waf')
    })
  })

  it('should handle fetch errors', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => {
              throw new Error('Fetch failed')
            },
          },
        },
      ],
      plugins: [],
    })

    const query = await store.messages.query(q => q.many({
      fetchPolicy: 'no-cache',
    }))

    expect(query.error.value?.message).toBe('Fetch failed')
  })

  it('should refresh data when refresh is called', async () => {
    let data = { id: 'foo', text: 'initial' }
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchFirst: () => data,
          },
        },
      ],
      plugins: [],
    })

    const query = await store.messages.query(q => q.first('foo'))

    expect(query.data.value?.text).toBe('initial')

    data = { id: 'foo', text: 'refreshed' }

    await query.refresh()

    expect(query.data.value?.text).toBe('refreshed')
  })

  it('should refresh data when options change', async () => {
    const data = {
      foo: { id: 'foo', text: 'foo' },
      bar: { id: 'bar', text: 'bar' },
    }
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchFirst: ({ key }) => {
              return data[key as keyof typeof data]
            },
          },
        },
      ],
      plugins: [],
    })

    const key = ref('foo')

    const query = await store.messages.query(q => q.first({
      key: key.value,
    }))

    expect(query.data.value?.text).toBe('foo')

    key.value = 'bar'
    await nextTick()
    expect(query.loading.value).toBe(true)
    await until(() => query.loading.value).toBe(false)

    expect(query.data.value?.text).toBe('bar')
  })

  it('should not load data when query is disabled', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchFirst: () => {
              throw new Error('Should not be called')
            },
          },
        },
      ],
      plugins: [],
    })

    const query = await store.messages.query(q => q.first({
      key: 'foo',
      enabled: false,
    }))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)
  })

  it('should re-enable query by setting option to object', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchFirst: ({ key }) => {
              return { id: key, text: 'from network' }
            },
          },
        },
      ],
      plugins: [],
    })

    const options = ref<any>({ enabled: false })

    const query = await store.messages.query(q => q.first({
      key: 'foo',
      ...options.value,
    }))

    expect(query.data.value).toBeNull()
    expect(query.loading.value).toBe(false)

    options.value = {}

    await nextTick()

    expect(query.loading.value).toBe(true)
    await until(() => query.loading.value).toBe(false)

    expect(query.data.value?.text).toBe('from network')
  })

  it('should garbage collect items', async () => {
    let data = [{ id: 1 }, { id: 2 }]
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany: () => {
              return data
            },
          },
        },
      ],
      plugins: [],
    })

    const query = await store.messages.query(q => q.many({
      experimentalGarbageCollection: true,
    }))

    // init tracking
    await query

    expect(query.data.value?.length).toBe(2)
    expect(store.$cache.readItem({
      collection: store.$collections[0]!,
      key: '2',
    })).toBeDefined()

    data = [{ id: 1 }]

    await query.refresh()

    expect(query.data.value?.length).toBe(1)
    expect(store.$cache.readItem({
      collection: store.$collections[0]!,
      key: '2',
    })).toBeUndefined()
  })

  describe('pagination', () => {
    it('should load more items with fetchMore', async () => {
      const fetchMessages = (pageIndex?: number) => {
        return [
          { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
          { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
        ]
      }
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
      }))

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
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
      }))

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
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
        pageSize: 2,
      }))

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
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
              create: ({ item }) => item,
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
        pageSize: 2,
      }))

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

    it('should load pages with cache-and-fetch and gc', async () => {
      const fetchMessages = (pageIndex?: number) => {
        return [
          { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
          { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
        ]
      }
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => fetchMessages(pageIndex),
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
        pageSize: 2,
        fetchPolicy: 'cache-and-fetch',
        experimentalGarbageCollection: true,
      }))

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
  })
})
