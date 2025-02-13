import { createStore } from '@rstore/vue'

export default defineNuxtPlugin({
  name: 'vanilla-rstore',
  async setup(nuxtApp) {
    const store = await createStore({
      model: vanillaModel,
      modelDefaults: {
        fields: {
          createdAt: {
            parse: value => typeof value === 'string' ? new Date(value) : value,
          },
        },
      },
      plugins: [
        {
          name: 'vanilla-rstore-plugin',
          setup({ hook }) {
            hook('fetchFirst', async (payload) => {
              if (payload.type.meta?.path) {
                payload.setResult(await $fetch(`/api/rest/${payload.type.meta.path}/${payload.key}`))
              }
            })
            hook('beforeCacheReadMany', (payload) => {
              // payload.setMarker(`many:${payload.type.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)
            })
            hook('fetchMany', async (payload) => {
              // payload.setMarker(`many:${payload.type.name}:${JSON.stringify(payload.findOptions?.filter ?? {})}`)

              if (payload.type.meta?.path) {
                payload.setResult(await $fetch(`/api/rest/${payload.type.meta.path}`, {
                  method: 'GET',
                  query: payload.findOptions?.params,
                }))
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

    // @ts-expect-error @TODO fix type error
    nuxtApp.vueApp.provide(vanillaStoreKey, store)
  },
})
