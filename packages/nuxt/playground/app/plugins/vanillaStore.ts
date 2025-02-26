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
          },
        },
      ],
    })

    const cacheKey = 'vanillaStore'

    nuxtApp.hook('app:rendered', () => {
      nuxtApp.payload.data[cacheKey] = store.cache.getState()
    })

    if (import.meta.client && nuxtApp.payload.data[cacheKey]) {
      store.cache.setState(nuxtApp.payload.data[cacheKey])
    }

    nuxtApp.vueApp.provide(vanillaStoreKey, store)
  },
})
