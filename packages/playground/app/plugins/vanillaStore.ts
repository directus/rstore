import { createStore } from '@rstore/vue'

export default defineNuxtPlugin({
  name: 'vanilla-rstore',
  async setup(nuxtApp) {
    function parseDate(value: any): Date {
      return typeof value === 'string' ? new Date(value) : value
    }

    const store = await createStore({
      model: vanillaModel,
      modelDefaults: {
        fields: {
          createdAt: {
            parse: parseDate,
          },
          updatedAt: {
            parse: parseDate,
          },
        },
      },
      plugins: [
        {
          name: 'vanilla-rstore-plugin',
          setup({ hook }) {
            hook('fetchFirst', async (payload) => {
              if (payload.type.meta?.path) {
                if (payload.key) {
                  const result = await $fetch(`/api/rest/${payload.type.meta.path}/${payload.key}`)
                  payload.setResult(result)
                }
                else {
                  const result: any = await $fetch(`/api/rest/${payload.type.meta.path}`, {
                    method: 'GET',
                    query: payload.findOptions?.params,
                  })
                  payload.setResult(result?.[0])
                }
              }
            })
            // hook('beforeCacheReadMany', (payload) => {
            //   payload.setMarker(`many:${payload.type.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)
            // })
            hook('fetchMany', async (payload) => {
              // payload.setMarker(`many:${payload.type.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)

              if (payload.type.meta?.path) {
                const result = await $fetch(`/api/rest/${payload.type.meta.path}`, {
                  method: 'GET',
                  query: payload.findOptions?.params,
                })
                payload.setResult(result)
              }
            })

            hook('fetchRelations', async (payload) => {
              const payloadResult = payload.getResult()
              const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
              await Promise.all(items.map(async (item) => {
                const key = payload.type.getKey(item)
                if (key) {
                  const wrappedItem = payload.store.cache.readItem({
                    type: payload.type,
                    key,
                  })
                  if (!wrappedItem) {
                    return
                  }

                  for (const relationKey in payload.findOptions.include) {
                    if (!payload.findOptions.include[relationKey]) {
                      continue
                    }

                    const relation = payload.type.relations[relationKey]
                    if (!relation) {
                      throw new Error(`Relation "${relationKey}" does not exist on model "${payload.type.name}"`)
                    }

                    await Promise.all(Object.keys(relation.to).map((modelKey) => {
                      const relationData = relation.to[modelKey]!
                      return store[modelKey as keyof typeof vanillaModel].findMany({
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
              if (payload.type.meta?.path) {
                const result = await $fetch(`/api/rest/${payload.type.meta.path}`, {
                  method: 'POST',
                  body: payload.item,
                })
                payload.setResult(result)
              }
            })

            hook('updateItem', async (payload) => {
              if (payload.type.meta?.path) {
                const result = await $fetch(`/api/rest/${payload.type.meta.path}/${payload.key}`, {
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
              if (payload.type.meta?.path) {
                await $fetch(`/api/rest/${payload.type.meta.path}/${payload.key}`, {
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
                  type: payload.type.name,
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
                  type: payload.type.name,
                  started: payload.meta.storeHistoryItem.started,
                  ended: new Date(),
                  result: payload.getResult(),
                  key: payload.key,
                  item: payload.item,
                  server: import.meta.server,
                })
              }
            })
          },
        },
      ],
    })

    const cacheKey = '$svanilla-rstore'

    nuxtApp.hook('app:rendered', () => {
      nuxtApp.payload.state[cacheKey] = markRaw(store.cache.getState())
    })

    if (import.meta.client && nuxtApp.payload.state[cacheKey]) {
      store.cache.setState(nuxtApp.payload.state[cacheKey])
    }

    nuxtApp.vueApp.provide(vanillaStoreKey, store)
  },
})

function convertFunctionsToString(obj: Record<string, any> | undefined) {
  if (!obj) {
    return obj
  }
  const result: Record<string, any> = {}
  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      result[key] = obj[key].toString()
    }
    else {
      result[key] = obj[key]
    }
  }
  return result
}
