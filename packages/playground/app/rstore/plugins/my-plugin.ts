import { faker } from '@faker-js/faker'

export default defineRstorePlugin({
  name: 'my-rstore-plugin',

  setup({ addModelDefaults, hook }) {
    function parseDate(value: any): Date {
      return typeof value === 'string' ? new Date(value) : value
    }

    addModelDefaults({
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
      if (payload.model.meta?.path) {
        if (payload.key) {
          const result = await $fetch(`/api/rest/${payload.model.meta.path}/${payload.key}`)
          payload.setResult(result)
        }
        else {
          const result: any = await $fetch(`/api/rest/${payload.model.meta.path}`, {
            method: 'GET',
            query: payload.findOptions?.params,
          })
          payload.setResult(result?.[0])
        }
      }
    })
    // hook('beforeCacheReadMany', (payload) => {
    //   payload.setMarker(`many:${payload.model.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)
    // })
    hook('fetchMany', async (payload) => {
      // payload.setMarker(`many:${payload.model.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)

      if (payload.model.meta?.path) {
        const result = await $fetch(`/api/rest/${payload.model.meta.path}`, {
          method: 'GET',
          query: payload.findOptions?.params,
        })
        payload.setResult(result)
      }
    })

    hook('fetchRelations', async (payload) => {
      const store = useStore()
      const payloadResult = payload.getResult()
      const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
      await Promise.all(items.map(async (item) => {
        const key = payload.model.getKey(item)
        if (key) {
          const wrappedItem = payload.store.$cache.readItem({
            model: payload.model,
            key,
          })
          if (!wrappedItem) {
            return
          }

          for (const relationKey in payload.findOptions.include) {
            if (!payload.findOptions.include[relationKey]) {
              continue
            }

            const relation = payload.model.relations[relationKey]
            if (!relation) {
              throw new Error(`Relation "${relationKey}" does not exist on model "${payload.model.name}"`)
            }

            await Promise.all(Object.keys(relation.to).map((modelName) => {
              const relationData = relation.to[modelName]!
              return store.$model(modelName).findMany({
                params: {
                  filter: `${relationData.on}:${wrappedItem[relationData.eq]}`,
                },
              })
            }))
          }
        }
      }))
    })

    hook('createItem', async (payload) => {
      if (payload.model.meta?.path) {
        const result = await $fetch(`/api/rest/${payload.model.meta.path}`, {
          method: 'POST',
          body: payload.item,
        })
        payload.setResult(result)
      }
    })

    hook('updateItem', async (payload) => {
      if (payload.model.meta?.path) {
        const result = await $fetch(`/api/rest/${payload.model.meta.path}/${payload.key}`, {
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
      if (payload.model.meta?.path) {
        await $fetch(`/api/rest/${payload.model.meta.path}/${payload.key}`, {
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
          model: payload.model.name,
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
          model: payload.model.name,
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
        if (payload.model.meta?.websocketTopic) {
          const newItem = {
            __typename: payload.model.name,
            id: crypto.randomUUID(),
            userName,
            userAvatar,
            text: payload.item.text,
            createdAt: new Date(),
          } as ChatMessage & { __typename: string }
          ws.send(JSON.stringify({
            type: 'publish',
            topic: payload.model.meta.websocketTopic,
            payload: newItem,
          } satisfies WebsocketMessage))
          payload.setResult(newItem)
        }
      })

      hook('subscribe', (payload) => {
        if (payload.model.meta?.websocketTopic) {
          ws.send(JSON.stringify({
            type: 'subscribe',
            topic: payload.model.meta.websocketTopic,
          } satisfies WebsocketMessage))
        }
      })

      hook('unsubscribe', (payload) => {
        if (payload.model.meta?.websocketTopic) {
          ws.send(JSON.stringify({
            type: 'unsubscribe',
            topic: payload.model.meta.websocketTopic,
          } satisfies WebsocketMessage))
        }
      })

      hook('init', (payload) => {
        watch(ws.data, async (data: string) => {
          try {
            const message = JSON.parse(data) as { item: any }
            if (message.item) {
              const { item } = message
              const model = payload.store.$getModel(item)
              if (model) {
                const key = model.getKey(item)
                if (!key) {
                  throw new Error(`Key not found for model ${model.name}`)
                }
                payload.store.$cache.writeItem({
                  model,
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
