// @ts-expect-error virtual module
import { url } from '#build/$rstore-directus-config.js'
import { authentication, createDirectus, createItem, deleteItem, readItem, readItems, realtime, rest, updateItem } from '@directus/sdk'
import { definePlugin, type VueStore } from '@rstore/vue'
import { useNuxtApp } from 'nuxt/app'
import { filterItem } from './filter'

export default definePlugin({
  name: 'rstore-directus',

  category: 'remote',

  // @TODO multi directus instances
  scopeId: 'rstore-directus',

  setup({ hook }) {
    const directus = createDirectus(url)
      .with(rest())
      .with(authentication())
      .with(realtime())

    const nuxt = useNuxtApp()
    nuxt.$directus = directus

    /* Fetch */

    hook('fetchFirst', async (payload) => {
      if (payload.key) {
        payload.setResult(await directus.request(readItem(payload.collection.name, payload.key)))
      }
      else {
        const result = await directus.request(readItems(payload.collection.name, {
          ...payload.findOptions?.filter ? { filter: payload.findOptions.filter } : {},
          limit: 1,
        }))
        if (result) {
          payload.setResult(result[0])
        }
      }
    })

    hook('fetchMany', async (payload) => {
      payload.setResult(await directus.request(readItems(payload.collection.name, {
        ...payload.findOptions?.filter ? { filter: payload.findOptions.filter } : {},
      })))
    })

    hook('fetchRelations', async (_payload) => {
      // TODO
    })

    /* Cache */

    hook('cacheFilterFirst', (payload) => {
      const filter = payload.findOptions?.filter
      if (filter && typeof filter === 'object') {
        const items = payload.readItemsFromCache()
        const result = items.find(item => filterItem(payload.store as VueStore, payload.collection, item, filter))
        payload.setResult(result)
      }
    })

    hook('cacheFilterMany', (payload) => {
      const filter = payload.findOptions?.filter
      if (filter && typeof filter === 'object') {
        const items = payload.getResult().filter(item => filterItem(payload.store as VueStore, payload.collection, item, filter))
        payload.setResult(items)
      }
    })

    /* Mutations */

    hook('createItem', async (payload) => {
      payload.setResult(await directus.request(createItem(payload.collection.name, payload.item)))
    })

    hook('updateItem', async (payload) => {
      payload.setResult(await directus.request(updateItem(payload.collection.name, payload.key, payload.item)))
    })

    hook('deleteItem', async (payload) => {
      await directus.request(deleteItem(payload.collection.name, payload.key))
    })
  },
})
