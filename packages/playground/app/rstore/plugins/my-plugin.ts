import { faker } from '@faker-js/faker'

const PAGE_SIZE = 20

export default defineRstorePlugin({
  name: 'my-rstore-plugin',

  before: {
    plugins: ['rstore-plugin-logger'],
    categories: ['processing'],
  },

  after: {
    plugins: ['rstore-plugin-virtual-relations'],
    categories: ['remote'],
  },

  setup({ addCollectionDefaults, hook }) {
    function parseDate(value: any): Date {
      return typeof value === 'string' ? new Date(value) : value
    }

    addCollectionDefaults({
      fields: {
        createdAt: {
          parse: parseDate,
        },
        updatedAt: {
          parse: parseDate,
        },
      },
    })

    hook('fetchFirst', async (payload) => {
      if (payload.collection.meta?.path) {
        if (payload.key) {
          const result = await $fetch(`/api/rest/${payload.collection.meta.path}/${payload.key}`)
          payload.setResult(result)
        }
        else {
          const result: any = await $fetch(`/api/rest/${payload.collection.meta.path}`, {
            method: 'GET',
            query: {
              ...payload.findOptions?.params,
              include: payload.findOptions?.include ? JSON.stringify(payload.findOptions.include) : undefined,
            },
          })
          payload.setResult(result?.[0])
        }
      }
    }, {
      ignoreScope: true,
    })
    // hook('beforeCacheReadMany', (payload) => {
    //   payload.setMarker(`many:${payload.collection.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)
    // })
    hook('fetchMany', async (payload) => {
      // payload.setMarker(`many:${payload.collection.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)

      if (payload.collection.meta?.path) {
        const { result, meta } = await $fetch(`/api/rest/${payload.collection.meta.path}`, {
          method: 'GET',
          query: {
            ...payload.findOptions?.pageIndex != null
              ? {
                  offset: payload.findOptions.pageIndex * PAGE_SIZE,
                  limit: PAGE_SIZE,
                }
              : {},
            ...payload.findOptions?.params,
            include: payload.findOptions?.include ? JSON.stringify(payload.findOptions.include) : undefined,
            sort: payload.findOptions?.sort && typeof payload.findOptions.sort === 'object' ? `${payload.findOptions.sort.id}:${payload.findOptions.sort.desc ? 'desc' : 'asc'}` : undefined,
          },
        })
        if (meta) {
          Object.assign(payload.meta, meta)
        }
        payload.setResult(result)
      }
    })

    hook('fetchRelations', async (payload) => {
      if (payload.collection.name === 'DataSource') {
        return
      }
      const { store } = payload
      const payloadResult = payload.getResult()
      const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
      await Promise.all(items.map(async (item) => {
        const key = payload.collection.getKey(item)
        if (key) {
          const wrappedItem = payload.store.$cache.readItem({
            collection: payload.collection,
            key,
          })
          if (!wrappedItem) {
            return
          }

          for (const relationKey in payload.findOptions.include) {
            if (!payload.findOptions.include[relationKey]) {
              continue
            }

            const relation = payload.collection.relations[relationKey]
            if (!relation) {
              throw new Error(`Relation "${relationKey}" does not exist on collection "${payload.collection.name}"`)
            }

            await Promise.all(Object.keys(relation.to).map((collectionName) => {
              const relationData = relation.to[collectionName]!
              const filters: Array<[string, any]> = []
              for (const onKey in relationData.on) {
                filters.push([String(relationData.on[onKey]), wrappedItem[onKey]])
              }
              return store.$collection(collectionName).findMany({
                params: {
                  filter: filters.map(f => f.join(':')).join(','),
                },
              })
            }))
          }
        }
      }))
    })

    hook('createItem', async (payload) => {
      if (payload.collection.meta?.path) {
        const result = await $fetch(`/api/rest/${payload.collection.meta.path}`, {
          method: 'POST',
          body: payload.item,
        })
        payload.setResult(result)
      }
    })

    hook('updateItem', async (payload) => {
      if (payload.collection.meta?.path) {
        const result = await $fetch(`/api/rest/${payload.collection.meta.path}/${payload.key}`, {
          method: 'PATCH',
          body: {
            ...payload.item,
            id: undefined,
          },
        })
        payload.setResult(result)
      }
    })

    hook('deleteItem', async (payload) => {
      if (payload.collection.meta?.path) {
        await $fetch(`/api/rest/${payload.collection.meta.path}/${payload.key}`, {
          method: 'DELETE',
        })
      }
    })

    const storeStats = useStoreStats()

    hook('beforeFetch', (payload) => {
      payload.meta.storeHistoryItem = {
        started: new Date(),
      }
    })

    hook('afterFetch', (payload) => {
      if (payload.meta.storeHistoryItem) {
        storeStats.value.store.push({
          operation: payload.many ? 'fetchMany' : 'fetchFirst',
          collection: payload.collection.name,
          started: payload.meta.storeHistoryItem.started,
          ended: new Date(),
          result: payload.getResult(),
          key: payload.key,
          findOptions: convertFunctionsToString(payload.findOptions),
          server: import.meta.server,
        })
      }
    })

    hook('beforeMutation', (payload) => {
      payload.meta.storeHistoryItem = {
        started: new Date(),
      }
    })

    hook('afterMutation', (payload) => {
      if (payload.meta.storeHistoryItem) {
        storeStats.value.store.push({
          operation: payload.mutation,
          collection: payload.collection.name,
          started: payload.meta.storeHistoryItem.started,
          ended: new Date(),
          result: payload.getResult(),
          key: payload.key,
          item: payload.item,
          server: import.meta.server,
        })
      }
    })

    if (import.meta.client) {
      const runtimeConfig = useRuntimeConfig()

      const ws = useWebSocket(runtimeConfig.public.wsEndpoint)

      const userName = faker.internet.username()
      const userAvatar = faker.image.avatar()

      hook('createItem', (payload) => {
        if (payload.collection.meta?.websocketTopic) {
          const newItem = {
            __typename: payload.collection.name,
            id: crypto.randomUUID(),
            userName,
            userAvatar,
            text: payload.item.text,
            createdAt: new Date(),
          } as ChatMessage & { __typename: string }
          ws.send(JSON.stringify({
            type: 'publish',
            topic: payload.collection.meta.websocketTopic,
            payload: newItem,
          } satisfies WebsocketMessage))
          payload.setResult(newItem)
        }
      })

      const countPerTopic: Record<string, number> = {}

      hook('subscribe', (payload) => {
        if (payload.collection.meta?.websocketTopic) {
          const topic = payload.collection.meta.websocketTopic
          countPerTopic[topic] ??= 0
          if (countPerTopic[topic] === 0) {
            ws.send(JSON.stringify({
              type: 'subscribe',
              topic,
            } satisfies WebsocketMessage))
          }
          countPerTopic[topic]++
        }
      })

      hook('unsubscribe', (payload) => {
        if (payload.collection.meta?.websocketTopic) {
          const topic = payload.collection.meta.websocketTopic
          countPerTopic[topic] ??= 1
          countPerTopic[topic]--
          if (countPerTopic[topic] === 0) {
            ws.send(JSON.stringify({
              type: 'unsubscribe',
              topic,
            } satisfies WebsocketMessage))
          }
        }
      })

      hook('init', (payload) => {
        watch(ws.data, async (data: string) => {
          try {
            const message = JSON.parse(data) as { item: any }
            if (message.item) {
              const { item } = message
              const collection = payload.store.$getCollection(item)
              if (collection) {
                const key = collection.getKey(item)
                if (key == null) {
                  throw new Error(`Key not found for collection ${collection.name}`)
                }
                payload.store.$cache.writeItem({
                  collection,
                  key,
                  item,
                })
              }
            }
          }
          catch (e) {
            console.error('Error parsing WebSocket message', e)
          }
        })
      })
    }
  },
})
