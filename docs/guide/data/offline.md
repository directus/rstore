# Offline <Badge text="New in v0.8" />

Use `@rstore/offline` to make your app resilient when the network is unavailable.

The plugin provides:

- persisted local cache state
- queued mutations that are replayed when connectivity returns

```sh
pnpm i @rstore/offline
```

## Setup

### 1. Register the offline plugin

```ts
import { createOfflinePlugin } from '@rstore/offline'
import { createStore } from '@rstore/vue'

const offlinePlugin = createOfflinePlugin({
  // options (storage, serialization, filters...)
})

const store = await createStore({
  schema,
  plugins: [
    // local/cache-style plugins first
    offlinePlugin,
    // then remote transport plugins
    remoteApiPlugin,
  ],
})
```

::: tip
Keep plugin order intentional. In most setups, local/offline plugins should run before remote plugins.
:::

### 2. Implement collection synchronization

You must provide your own sync strategy using the `syncCollection` hook. A common approach is:

1. Compare locally stored keys with keys that still exist on the backend.
2. Delete missing local items.
3. Fetch changed/new records since the last sync timestamp.
4. Write those records into the local cache.

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
            // Ask the backend which of these keys still exist
            keys: loadedKeys,
            // It is recommended to return only primary keys here
          },
          fetchPolicy: 'no-cache',
        })

        // Determine which locally cached items were deleted remotely
        const existingKeys = new Set(existingItems.map(item => collection.getKey(item)!))
        const itemsToDeleteKeys = loadedKeys.filter(key => !existingKeys.has(key))
        deleteItems(itemsToDeleteKeys)

        // Fetch updated or newly created records since last sync
        const items = await collectionApi.findMany({
          params: {
            // Example shape, adapt to your backend
            filter: {
              updatedAt: {
                gte: (lastUpdatedAt ?? new Date(0)).toISOString(),
              }
            },
          },
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

        // Determine which locally cached items were deleted remotely
        const existingKeys = new Set(existingItems.map(item => collection.getKey(item)!))
        const itemsToDeleteKeys = loadedKeys.filter(key => !existingKeys.has(key))
        deleteItems(itemsToDeleteKeys)

        // Fetch updated or newly created records since last sync
        const items = await collectionApi.findMany({
          params: {
            // Example shape, adapt to your backend
            filter: {
              updatedAt: {
                gte: (lastUpdatedAt ?? new Date(0)).toISOString(),
              },
            },
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

## Requirements for reliable sync

For a robust offline experience, each collection should have:

- a stable key (`id`, `_id`, or custom `getKey`)
- a server field usable for incremental sync (for example `updatedAt` or monotonically increasing revision)
- idempotent mutation endpoints, so replayed requests are safe
- server responses that return canonical item data after create/update

## Mutations

While offline, mutations are queued and replayed when the connection is restored. The plugin handles queue execution automatically.

Conflicts are application-specific. If multiple clients can edit the same records, implement conflict strategy on the backend (for example last-write-wins, merge rules, or version checks) and return canonical records so rstore can converge correctly.
