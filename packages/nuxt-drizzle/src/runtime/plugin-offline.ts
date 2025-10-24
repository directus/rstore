// @ts-expect-error virtual file
import { syncSerializeDateValue } from '#build/$rstore-drizzle-config'
import { definePlugin, type VueStore } from '@rstore/vue'
import { gte } from './utils/where'

export default definePlugin({
  name: 'rstore-drizzle-offline',

  category: 'local',

  // @TODO multi drizzle instances
  scopeId: 'rstore-drizzle',

  setup({ hook }) {
    if (import.meta.client) {
      hook('syncCollection', async ({ store, collection, lastUpdatedAt, loadedItems, storeItems, deleteItems }) => {
        const collectionApi = (store as VueStore).$collection(collection.name)
        if (!collectionApi) {
          throw new Error(`Collection ${collection.name} not found in store`)
        }

        let date: any = lastUpdatedAt ?? new Date(0)
        if (syncSerializeDateValue) {
          date = syncSerializeDateValue(date)
        }

        // Check for deleted items
        const loadedKeys = loadedItems().map(item => collection.getKey(item)!)
        const existingItems = await collectionApi.findMany({
          params: {
            keys: loadedKeys,
            columns: (collection.meta?.primaryKeys ?? ['id']).reduce((acc, key) => {
              acc[key] = true
              return acc
            }, {} as Record<string, true>),
          },
          fetchPolicy: 'no-cache',
        })
        const existingKeys = new Set(existingItems.map(item => collection.getKey(item)!))
        const itemsToDeleteKeys = loadedKeys.filter(key => !existingKeys.has(key))
        deleteItems(itemsToDeleteKeys)

        const items = await collectionApi.findMany({
          where: gte('updatedAt', date),
          fetchPolicy: 'no-cache',
        })

        storeItems(items.map(item => item.$raw()))
      })
    }
  },
})
