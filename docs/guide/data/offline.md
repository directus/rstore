# Offline <Badge text="New in v0.8" />

To implement an offline mode in your application using RStore, you can use the `@rstore/offline` plugin. This plugin allows your app to function seamlessly even when there is no internet connection, by caching data locally and synchronizing changes when the connection is restored.

```bash
pnpm i @rstore/offline
```

## Setup

To set up the offline plugin, you need to import it and add it to your RStore instance. Here's an example of how to do this:

```ts
import { createOfflinePlugin } from '@rstore/offline'

const offlinePlugin = createOfflinePlugin({
  // Plugin options go here
})

const store = createRStore({
  plugins: [
    // ...other plugins
    offlinePlugin,
  ],
})
```

Then, in your application, you need to implement the logic to synchronize the collections with the `syncCollection` plugin hook:

::: code-group

```ts [Vue]
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-offline-plugin',
  category: 'local',
  setup({ hook }) {
    if (typeof window !== 'undefined') {
      hook('syncCollection', async ({ store, collection, lastUpdatedAt, loadedItems, storeItems, deleteItems }) => {
        // Access the collection API
        const collectionApi = store.$collection(collection.name)
        if (!collectionApi) {
          throw new Error(`Collection ${collection.name} not found in store`)
        }

        // Check for deleted items
        const loadedKeys = loadedItems().map(item => collection.getKey(item)!)
        const existingItems = await collectionApi.findMany({
          params: {
            // Example of `filter` parameter for your backend
            filter: {
              updatedAt: {
                gte: (lastUpdatedAt ?? new Date(0)).toISOString(),
              }
            }
          },
          fetchPolicy: 'no-cache',
        })
        // Determine which items have been deleted
        // by comparing loaded items with existing items
        const existingKeys = new Set(existingItems.map(item => collection.getKey(item)!))
        const itemsToDeleteKeys = loadedKeys.filter(key => !existingKeys.has(key))
        deleteItems(itemsToDeleteKeys)

        // Fetch updated or new items
        const items = await collectionApi.findMany({
          where: gte('updatedAt', lastUpdatedAt ?? new Date(0)),
          fetchPolicy: 'no-cache',
        })

        storeItems(items.map(item => item.$raw()))
      })
    }
  }
})
```

```ts [Nuxt]
// nuxt/app/rstore/plugins/my-offline-plugin.ts
export default defineRstorePlugin({
  name: 'my-offline-plugin',
  category: 'local',
  setup({ hook }) {
    if (import.meta.client) {
      hook('syncCollection', async ({ store, collection, lastUpdatedAt, loadedItems, storeItems, deleteItems }) => {
        // Access the collection API
        const collectionApi = store.$collection(collection.name)
        if (!collectionApi) {
          throw new Error(`Collection ${collection.name} not found in store`)
        }

        // Check for deleted items
        const loadedKeys = loadedItems().map(item => collection.getKey(item)!)
        const existingItems = await collectionApi.findMany({
          params: {
            // For example create a special `keys` parameter for your backend
            keys: loadedKeys,
            // It is also recommended to only return the primary keys
          },
          fetchPolicy: 'no-cache',
        })
        // Determine which items have been deleted
        // by comparing loaded items with existing items
        const existingKeys = new Set(existingItems.map(item => collection.getKey(item)!))
        const itemsToDeleteKeys = loadedKeys.filter(key => !existingKeys.has(key))
        deleteItems(itemsToDeleteKeys)

        // Fetch updated or new items
        const items = await collectionApi.findMany({
          params: {
            // Example of `filter` parameter for your backend
            filter: {
              updatedAt: {
                gte: (lastUpdatedAt ?? new Date(0)).toISOString(),
              }
            }
          },
          fetchPolicy: 'no-cache',
        })

        storeItems(items.map(item => item.$raw()))
      })
    }
  }
})
```

:::

::: tip
In the above examples, you don't have to use the store APIs to fetch data from your backend. You can use any HTTP client or data fetching library of your choice.
:::

## Mutations

While offline, any mutations made to the collections will be queued and synchronized with the server once the connection is restored. The offline plugin handles this automatically, ensuring that your data remains consistent.
