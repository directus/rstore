# Plugin Hooks

[Learn more](./setup.md#hooks) about setting up a plugin and using hooks.

Each hook has a payload object that is sent to the registered callback functions.

## Metadata

Most hook payloads have a `meta` object that can store any kind of metadata. For example, it can be used to expose additional information from the server to the queries.

It's type can be extended like this:

```ts
// hook.d.ts

declare module '@rstore/vue' {
  export interface CustomHookMeta {
    totalPage?: number
  }
}

export {}
```

## Data handling

Those hooks are the main ones to handle data fetching and item mutations.

### fetchFirst

This hook is called when rstore determines that it needs to fetch an item depending on the state of the cache or the [fetch policy](../data/query.md#fetch-policy).

```ts
hook('fetchFirst', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
    payload.setMarker, // A function to set the marker for the query
  )
})
```

::: info
Markers are used to remember if a query has already been fetched or not where it is not based on the item key. For example, if you have a query that fetches all items with a certain filter, the marker is used to remember if the query has already been fetched or not.
:::

::: warning Auto-abort remaining callbacks
If a non-null result is set with `setResult`, the remaining callbacks for this hook will not be called by default. This is useful in case you have multiple plugins that can fetch the same collections (for example, one local and one remote). The first plugin to set a non-null result will abort the remaining callbacks.

You can override this behavior by passing `{ abort: false }` as the second argument to `setResult`.

```ts
setResult(result, { abort: false })
```
:::

Example:

::: code-group

```ts [Vue]
hook('fetchFirst', async (payload) => {
  if (payload.key) {
    // Based on a key
    const result = await fetch(`/api/${payload.collection.name}/${payload.key}`)
      .then(r => r.json())
    payload.setResult(result)
  }
  else {
    // Using filters
    const result = await fetch(`/api/${payload.collection.name}?filter=${payload.findOptions.params.filter}&limit=1`)
      .then(r => r.json())
    payload.setResult(result?.[0])
  }
})
```

```ts [Nuxt]
hook('fetchFirst', async (payload) => {
  if (payload.key) {
    // Based on a key
    const result = await $fetch(`/api/${payload.collection.name}/${payload.key}`)
    payload.setResult(result)
  }
  else {
    // Using filters
    const result = await $fetch(`/api/${payload.collection.name}`, {
      query: {
        filter: payload.findOptions.params.filter,
        limit: 1,
      },
    })
    payload.setResult(result?.[0])
  }
})
```

:::

### fetchMany

This hook is called when rstore determines that it needs to fetch a list of items depending on the state of the cache or the [fetch policy](../data/query.md#fetch-policy).

```ts
hook('fetchMany', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
    payload.setMarker, // A function to set the marker for the query
  )
})
```

::: warning Auto-abort remaining callbacks
If a non-null result is set with `setResult`, the remaining callbacks for this hook will not be called by default. This is useful in case you have multiple plugins that can fetch the same collections (for example, one local and one remote). The first plugin to set a non-null result will abort the remaining callbacks.

You can override this behavior by passing `{ abort: false }` as the second argument to `setResult`.

```ts
setResult(result, { abort: false })
```
:::

Example:

::: code-group

```ts [Vue]
hook('fetchMany', async (payload) => {
  const result = await fetch(`/api/${payload.collection.name}?filter=${payload.findOptions.params.filter}`)
    .then(r => r.json())
  payload.setResult(result)
})
```

```ts [Nuxt]
hook('fetchMany', async (payload) => {
  const result = await $fetch(`/api/${payload.collection.name}`, {
    query: {
      filter: payload.findOptions.params.filter,
    },
  })
  payload.setResult(result)
})
```
:::

### createItem

This hook is called when rstore needs to create a new item.

```ts
hook('createItem', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.item, // The data for the item to create
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```

::: warning Auto-abort remaining callbacks
If a non-null result is set with `setResult`, the remaining callbacks for this hook will not be called by default. This is useful in case you have multiple plugins that can fetch the same collections (for example, one local and one remote). The first plugin to set a non-null result will abort the remaining callbacks.

You can override this behavior by passing `{ abort: false }` as the second argument to `setResult`.

```ts
setResult(result, { abort: false })
```
:::

Example:

::: code-group

```ts [Vue]
hook('createItem', async (payload) => {
  const result = await fetch(`/api/${payload.collection.name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.item),
  }).then(r => r.json())
  payload.setResult(result)
})
```

```ts [Nuxt]
hook('createItem', async (payload) => {
  const result = await $fetch(`/api/${payload.collection.name}`, {
    method: 'POST',
    body: payload.item,
  })
  payload.setResult(result)
})
```

:::

### createMany <Badge text="New in v0.7.3" />

This hook is called when rstore needs to create many new items at once when [`createMany()`](../data/mutation.md#create-many) is used.

::: tip
If no `createMany` hook is defined, rstore will fallback to calling the [`createItem`](#createitem) hook for each item in the array. If hooks for `createMany` are defined but none of them [aborts](#aborting), rstore will also fallback to calling the `createItem` hook for each item. Calling `abort()` or `setResult(value)` with a non-empty array in the `createMany` hook will prevent this behavior.
:::

```ts
hook('createMany', async (payload) => {
  const result = await fetch(`/api/${payload.collection.name}/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.items),
  }).then(r => r.json())
  payload.setResult(result)
})
```

### updateItem

This hook is called when rstore needs to update an existing item.

```ts
hook('updateItem', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key of the item to update
    payload.item, // The data for the item to update
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```

::: warning Auto-abort remaining callbacks
If a non-null result is set with `setResult`, the remaining callbacks for this hook will not be called by default. This is useful in case you have multiple plugins that can fetch the same collections (for example, one local and one remote). The first plugin to set a non-null result will abort the remaining callbacks.

You can override this behavior by passing `{ abort: false }` as the second argument to `setResult`.

```ts
setResult(result, { abort: false })
```
:::

Example:

::: code-group

```ts [Vue]
hook('updateItem', async (payload) => {
  const result = await fetch(`/api/${payload.collection.name}/${payload.key}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.item),
  }).then(r => r.json())
  payload.setResult(result)
})
```

```ts [Nuxt]
hook('updateItem', async (payload) => {
  const result = await $fetch(`/api/${payload.collection.name}/${payload.key}`, {
    method: 'PATCH',
    body: payload.item,
  })
  payload.setResult(result)
})
```
:::

### updateMany <Badge text="New in v0.7.3" />

This hook is called when rstore needs to update many existing items at once when [`updateMany()`](../data/mutation.md#update-many) is used.

::: tip
If no `updateMany` hook is defined, rstore will fallback to calling the [`updateItem`](#updateitem) hook for each item in the array. If hooks for `updateMany` are defined but none of them [aborts](#aborting), rstore will also fallback to calling the `updateItem` hook for each item. Calling `abort()` or `setResult(value)` with a non-empty array in the `updateMany` hook will prevent this behavior.
:::

::: danger

Contrary to `createMany` hook, the `updateMany` hook receives an array of items that already contain their keys:

```ts
interface Payload {
  items: Array<{ key: string | number, item: any }>
  /// ...
}
```

:::

```ts
hook('updateMany', async (payload) => {
  const result = await fetch(`/api/${payload.collection.name}/batch`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.items.map(i => i.item)),
  }).then(r => r.json())
  payload.setResult(result)
})
```

### deleteItem

This hook is called when rstore needs to delete an existing item.

```ts
hook('deleteItem', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key of the item to delete
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('deleteItem', async (payload) => {
  await fetch(`/api/${payload.collection.name}/${payload.key}`, {
    method: 'DELETE',
  })
})
```

```ts [Nuxt]
hook('deleteItem', async (payload) => {
  await $fetch(`/api/${payload.collection.name}/${payload.key}`, {
    method: 'DELETE',
  })
})
```
:::

### deleteMany <Badge text="New in v0.7.3" />

This hook is called when rstore needs to delete many existing items at once when [`deleteMany()`](../data/mutation.md#delete-many) is used.

It receives an array of keys to delete:

```ts
hook('deleteMany', async (payload) => {
  await fetch(`/api/${payload.collection.name}/batch`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload.keys),
  })
})
```

### Aborting <Badge text="New in v0.7" />

If you have multiple plugins that can handle the same collections, you can abort the remaining callbacks for a *Data handling* hook by calling `abort()` on the payload.

```ts
hook('deleteItem', (payload) => {
  if (payload.collection.name === 'MyCollection') {
    // ...

    // Abort the remaining callbacks for this hook
    payload.abort()
  }
})
```

::: info
For `fetchFirst`, `fetchMany`, `createItem` and `updateItem`, the remaining callbacks are automatically aborted when a non-null result is set with `setResult`.

```ts
pluginApi.hook('fetchFirst', async (payload) => {
  // If the item is non-null,
  // remaining `fetchFirst` hooks will not be called
  payload.setResult(cache.get(payload.key))
  // If `cache.get(payload.key)` is null,
  // remaining `fetchFirst` hooks will be called
})
```

Note that in the above example, adding a condition to call `setResult` is not necessary because it checks if the value is null or empty (for arrays) before aborting the remaining callbacks.

You can prevent this behavior by setting `abort: false` to the second argument of `setResult()`.

```ts
payload.setResult(cache.get(payload.key), { abort: false })
```
:::

## Fetching relations

Learn more about setting up relations [here](../schema/relations.md) and how to query them [here](../data/query.md#fetching-relations).

### fetchRelations

This hook is called when rstore needs to fetch relations.

```ts
hook('fetchRelations', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key of the item to fetch the relations for
    payload.findOptions, // The find options passed to the query with the `include` option
    payload.many, // Boolean indicating if the query is for many items or one item
    payload.getResult, // A function to get the result of the query
  )
})
```

Within callbacks to this hook, you can use any of the store methods to fetch the necessary data. For example, you can use `findFirst` or `findMany` to fetch the data for the relations.

Example collection:

```ts
const commentCollection = defineCollection({
  name: 'Comment',
  relations: {
    author: {
      to: {
        User: {
          on: 'id', // User.id
          eq: 'authorId', // Comment.authorId
        },
      },
    },
  },
})
```

Example query:

```ts
const { data: comments } = store.comments.query(q => q.many({
  include: {
    author: true,
  },
}))
```

Example that uses `findMany` to fetch the relations:

```ts
hook('fetchRelations', async (payload) => {
  // Use the Vue store
  const store = useStore()

  // Retrieve the data from the query that needs relations
  const payloadResult = payload.getResult()
  const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]

  // Fetch relations in parallel
  await Promise.all(items.map(async (item) => {
    const key = payload.collection.getKey(item)
    if (key) {
      // Read the item from the cache to also include computed properties
      const currentItem = payload.store.cache.readItem({
        collection: payload.collection,
        key,
      })
      if (!currentItem) {
        return
      }

      // For each requested relation
      for (const relationKey in payload.findOptions.include) {
        if (!payload.findOptions.include[relationKey]) {
          continue
        }

        const relation = payload.collection.relations[relationKey]
        //    ^^^^^^^^
        //    { to: { User: { on: 'id', eq: 'authorId' } } }
        if (!relation) {
          throw new Error(`Relation "${relationKey}" does not exist on collection "${payload.collection.name}"`)
        }

        await Promise.all(Object.keys(relation.to).map((collectionName) => {
          const relationData = relation.to[collectionName]!
          //    ^^^^^^^^^^^^
          //    { on: 'id', eq: 'authorId' }
          return store.$collection(collectionName).findMany({
            params: {
              filter: `${relationData.on}:${currentItem[relationData.eq]}`,
            },
          })
        }))
      }
    }
  }))
})
```

## Custom Cache filtering

By default rstore doesn't know how to filter the cache based on the parameters passed to the queries. That's why you need to also pass a `filter` function to the `findOptions` object for `query` and [the other ones](../data/query.md).

However, it is possible to automatically apply a filtering logic depending on the parameters used in your project with the `cacheFilterFirst` and `cacheFilterMany` hooks.

### cacheFilterFirst

This hook is called when rstore wants to filter the cache for a single item.

```ts
hook('cacheFilterFirst', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
    payload.readItemsFromCache(), // A function to read all items of the collection from the cache
  )
})
```

Let's see an example in which we consider `filter` to be an object that is used to filter the data in the cache and to fetch the data from the server.

::: code-group

```ts [Vue]
hook('cacheFilterFirst', (payload) => {
  const { key, findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own filtering logic reused on the collections
    const item = payload.readItemsFromCache().find((item) => {
      for (const [key, value] of Object.entries(findOptions.filter)) {
        if (item[key] !== value) {
          return false
        }
      }
      return true
    })
    payload.setResult(item)
  }
})

hook('fetchFirst', async (payload) => {
  const { key, findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own fetching logic reused on the collections
    const result = await fetch(`/api/${payload.collection.name}/${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: findOptions.filter
      }),
    }).then(r => r.json())
    payload.setResult(result)
  }
})
```

```ts [Nuxt]
hook('cacheFilterFirst', (payload) => {
  const { key, findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own filtering logic reused on the collections
    const item = payload.readItemsFromCache().find((item) => {
      for (const [key, value] of Object.entries(findOptions.filter)) {
        if (item[key] !== value) {
          return false
        }
      }
      return true
    })
    payload.setResult(item)
  }
})

hook('fetchFirst', async (payload) => {
  const { key, findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own fetching logic reused on the collections
    const result = await $fetch(`/api/${payload.collection.name}/${key}`, {
      method: 'POST',
      body: {
        filter: findOptions.filter
      },
    })
    payload.setResult(result)
  }
})
```

:::

With this we can now use the `filter` find option as an object:

Before:

```ts{3-8}
const email = ref('cat@acme.com')
const { data: user } = store.users.query(q => q.first({
  // This is used to filter the data in the cache
  filter: item => item.email === email.value,
  params: {
    // This is used to fetch the data from the server
    filter: { email: email.value },
  },
}))
```

After:

```ts{3-5}
const email = ref('cat@acme.com')
const { data: user } = store.users.query(q => q.first({
  // This is used to filter the data in the cache
  // and to fetch the data from the server
  filter: { email: email.value },
}))
```

If you are using TypeScript, you can augment the `` interface to customize the type of the `filter` find option:

```ts
import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomFilterOption<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    email?: string
  }
}

export {}
```

### cacheFilterMany

You can also filter on lists with the `cacheFilterMany` hook.

```ts
hook('cacheFilterMany', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('cacheFilterMany', (payload) => {
  const { findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own filtering logic reused on the collections
    const items = payload.getResult().filter((item) => {
      for (const [key, value] of Object.entries(findOptions.filter)) {
        if (item[key] !== value) {
          return false
        }
      }
      return true
    })
    payload.setResult(items)
  }
})

hook('fetchMany', async (payload) => {
  const { findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own fetching logic reused on the collections
    const result = await fetch(`/api/${payload.collection.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: findOptions.filter
      }),
    }).then(r => r.json())
    payload.setResult(result)
  }
})
```

```ts [Nuxt]
hook('cacheFilterMany', (payload) => {
  const { findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own filtering logic reused on the collections
    const items = payload.getResult().filter((item) => {
      for (const [key, value] of Object.entries(findOptions.filter)) {
        if (item[key] !== value) {
          return false
        }
      }
      return true
    })
    payload.setResult(items)
  }
})

hook('fetchMany', async (payload) => {
  const { findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own fetching logic reused on the collections
    const result = await $fetch(`/api/${payload.collection.name}`, {
      method: 'POST',
      body: {
        filter: findOptions.filter
      },
    })
    payload.setResult(result)
  }
})
```

:::

With this we can now use the `filter` find option as an object:

Before:

```ts{3-8}
const email = ref('cat@acme.com')
const { data: users } = store.users.query(q => q.many({
  // This is used to filter the data in the cache
  filter: item => item.email === email.value,
  params: {
    // This is used to fetch the data from the server
    filter: { email: email.value },
  },
}))
```

After:

```ts{3-5}
const email = ref('cat@acme.com')
const { data: users } = store.users.query(q => q.many({
  // This is used to filter the data in the cache
  // and to fetch the data from the server
  filter: { email: email.value },
}))
```

If you are using TypeScript, you can augment the `` interface to customize the type of the `filter` find option:

```ts
import type { Collection, CollectionDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomFilterOption<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    email?: string
  }
}

export {}
```

## Subscriptions

### subscribe

This hook is called when rstore needs to subscribe to a data collection.

```ts
hook('subscribe', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.subscriptionId, // The unique ID of the subscription to help track it
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query
  )
})
```

### unsubscribe

This hook is called when rstore needs to unsubscribe from a data collection.

```ts
hook('unsubscribe', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.collection, // The current collection
    payload.subscriptionId, // The unique ID of the subscription to help track it
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query
  )
})
```

### Websocket example

This example shows how to use the `subscribe` and `unsubscribe` hooks to manage WebSocket subscriptions. A topic counter is used to keep track of how many subscriptions are active for each topic. When the count reaches zero, the WebSocket unsubscribes from the topic.

```ts
import { useWebSocket } from '@vueuse/core'

export default definePlugin({
  name: 'my-ws-plugin',

  setup({ hook }) {
    const ws = useWebSocket('/_ws')

    const countPerTopic: Record<string, number> = {}

    hook('subscribe', (payload) => {
      if (payload.collection.meta?.websocketTopic) {
        const topic = payload.collection.meta.websocketTopic

        countPerTopic[topic] ??= 0

        // If the topic is not already subscribed, subscribe to it
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

        // If the topic is no longer subscribed, unsubscribe from it
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
          // Parse the message
          const message = JSON.parse(data) as { item: any }

          if (message.item) {
            const { item } = message

            // Retrieve the collection from the store
            const collection = payload.store.$getCollection(item)
            if (collection) {
              // Compute the key for the item
              const key = collection.getKey(item)
              if (key == null) {
                throw new Error(`Key not found for collection ${collection.name}`)
              }

              // Write the item to the cache
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
  },
})
```

## Advanced usage

### init

The `init` hook is called when the store is created.

```ts
hook('init', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
  )
})
```

### beforeFetch

```ts
hook('beforeFetch', (payload) => {
  console.log(
    payload.store,
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.many, // Boolean indicating if the query is for many items or one item
    payload.updateFindOptions, // A function to update the find options
  )
})
```

### afterFetch

```ts
hook('afterFetch', (payload) => {
  console.log(
    payload.store,
    payload.meta,
    payload.collection, // The current collection
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.many, // Boolean indicating if the query is for many items or one item
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```
