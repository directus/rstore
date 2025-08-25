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
    payload.model, // The current model
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

Example:

::: code-group

```ts [Vue]
hook('fetchFirst', async (payload) => {
  if (payload.key) {
    // Based on a key
    const result = await fetch(`/api/${payload.model.name}/${payload.key}`)
      .then(r => r.json())
    payload.setResult(result)
  }
  else {
    // Using filters
    const result = await fetch(`/api/${payload.model.name}?filter=${payload.findOptions.params.filter}&limit=1`)
      .then(r => r.json())
    payload.setResult(result?.[0])
  }
})
```

```ts [Nuxt]
hook('fetchFirst', async (payload) => {
  if (payload.key) {
    // Based on a key
    const result = await $fetch(`/api/${payload.model.name}/${payload.key}`)
    payload.setResult(result)
  }
  else {
    // Using filters
    const result = await $fetch(`/api/${payload.model.name}`, {
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
    payload.model, // The current model
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
    payload.setMarker, // A function to set the marker for the query
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('fetchMany', async (payload) => {
  const result = await fetch(`/api/${payload.model.name}?filter=${payload.findOptions.params.filter}`)
    .then(r => r.json())
  payload.setResult(result)
})
```

```ts [Nuxt]
hook('fetchMany', async (payload) => {
  const result = await $fetch(`/api/${payload.model.name}`, {
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
    payload.model, // The current model
    payload.item, // The data for the item to create
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('createItem', async (payload) => {
  const result = await fetch(`/api/${payload.model.name}`, {
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
  const result = await $fetch(`/api/${payload.model.name}`, {
    method: 'POST',
    body: payload.item,
  })
  payload.setResult(result)
})
```

:::

### updateItem

This hook is called when rstore needs to update an existing item.

```ts
hook('updateItem', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
    payload.key, // The key of the item to update
    payload.item, // The data for the item to update
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('updateItem', async (payload) => {
  const result = await fetch(`/api/${payload.model.name}/${payload.key}`, {
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
  const result = await $fetch(`/api/${payload.model.name}/${payload.key}`, {
    method: 'PATCH',
    body: payload.item,
  })
  payload.setResult(result)
})
```
:::

### deleteItem

This hook is called when rstore needs to delete an existing item.

```ts
hook('deleteItem', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
    payload.key, // The key of the item to delete
  )
})
```

Example:

::: code-group

```ts [Vue]
hook('deleteItem', async (payload) => {
  await fetch(`/api/${payload.model.name}/${payload.key}`, {
    method: 'DELETE',
  })
})
```

```ts [Nuxt]
hook('deleteItem', async (payload) => {
  await $fetch(`/api/${payload.model.name}/${payload.key}`, {
    method: 'DELETE',
  })
})
```
:::

## Fetching relations

Learn more about setting up relations [here](../model//relations.md) and how to query them [here](../data/query.md#fetching-relations).

### fetchRelations

This hook is called when rstore needs to fetch relations.

```ts
hook('fetchRelations', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
    payload.key, // The key of the item to fetch the relations for
    payload.findOptions, // The find options passed to the query with the `include` option
    payload.many, // Boolean indicating if the query is for many items or one item
    payload.getResult, // A function to get the result of the query
  )
})
```

Within callbacks to this hook, you can use any of the store methods to fetch the necessary data. For example, you can use `findFirst` or `findMany` to fetch the data for the relations.

Example model:

```ts
const commentModel = defineDataModel({
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
const { data: comments } = store.comments.queryMany({
  include: {
    author: true,
  },
})
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
    const key = payload.model.getKey(item)
    if (key) {
      // Read the item from the cache to also include computed properties
      const currentItem = payload.store.cache.readItem({
        model: payload.model,
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

        const relation = payload.model.relations[relationKey]
        //    ^^^^^^^^
        //    { to: { User: { on: 'id', eq: 'authorId' } } }
        if (!relation) {
          throw new Error(`Relation "${relationKey}" does not exist on model "${payload.model.name}"`)
        }

        await Promise.all(Object.keys(relation.to).map((modelName) => {
          const relationData = relation.to[modelName]!
          //    ^^^^^^^^^^^^
          //    { on: 'id', eq: 'authorId' }
          return store.$model(modelName).findMany({
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

By default rstore doesn't know how to filter the cache based on the parameters passed to the queries. That's why you need to also pass a `filter` function to the `findOptions` object for `queryFirst`, `queryMany` and [the other ones](../data/query.md).

However, it is possible to automatically apply a filtering logic depending on the parameters used in your project with the `cacheFilterFirst` and `cacheFilterMany` hooks.

### cacheFilterFirst

This hook is called when rstore wants to filter the cache for a single item.

```ts
hook('cacheFilterFirst', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
    payload.readItemsFromCache(), // A function to read all items of the model from the cache
  )
})
```

Let's see an example in which we consider `filter` to be an object that is used to filter the data in the cache and to fetch the data from the server.

::: code-group

```ts [Vue]
hook('cacheFilterFirst', (payload) => {
  const { key, findOptions } = payload

  if (findOptions.filter && typeof findOptions.filter === 'object') {
    // Implement our own filtering logic reused on the models
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
    // Implement our own fetching logic reused on the models
    const result = await fetch(`/api/${payload.model.name}/${key}`, {
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
    // Implement our own filtering logic reused on the models
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
    // Implement our own fetching logic reused on the models
    const result = await $fetch(`/api/${payload.model.name}/${key}`, {
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
const { data: user } = store.users.queryFirst(() => ({
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
const { data: user } = store.users.queryFirst(() => ({
  // This is used to filter the data in the cache
  // and to fetch the data from the server
  filter: { email: email.value },
}))
```

If you are using TypeScript, you can augment the `` interface to customize the type of the `filter` find option:

```ts
import type { Model, ModelDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomFilterOption<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
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
    payload.model, // The current model
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
    // Implement our own filtering logic reused on the models
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
    // Implement our own fetching logic reused on the models
    const result = await fetch(`/api/${payload.model.name}`, {
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
    // Implement our own filtering logic reused on the models
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
    // Implement our own fetching logic reused on the models
    const result = await $fetch(`/api/${payload.model.name}`, {
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
const { data: users } = store.users.queryMany(() => ({
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
const { data: users } = store.users.queryMany(() => ({
  // This is used to filter the data in the cache
  // and to fetch the data from the server
  filter: { email: email.value },
}))
```

If you are using TypeScript, you can augment the `` interface to customize the type of the `filter` find option:

```ts
import type { Model, ModelDefaults, StoreSchema } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomFilterOption<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TSchema extends StoreSchema,
  > {
    email?: string
  }
}

export {}
```

## Subscriptions

### subscribe

This hook is called when rstore needs to subscribe to a data model.

```ts
hook('subscribe', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
    payload.subscriptionId, // The unique ID of the subscription to help track it
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query
  )
})
```

### unsubscribe

This hook is called when rstore needs to unsubscribe from a data model.

```ts
hook('unsubscribe', (payload) => {
  console.log(
    payload.store, // The store instance
    payload.meta,
    payload.model, // The current model
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
      if (payload.model.meta?.websocketTopic) {
        const topic = payload.model.meta.websocketTopic

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
      if (payload.model.meta?.websocketTopic) {
        const topic = payload.model.meta.websocketTopic

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

            // Retrieve the model from the store
            const model = payload.store.$getModel(item)
            if (model) {
              // Compute the key for the item
              const key = model.getKey(item)
              if (!key) {
                throw new Error(`Key not found for model ${model.name}`)
              }

              // Write the item to the cache
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
    payload.model, // The current model
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
    payload.model, // The current model
    payload.key, // The key passed to the query
    payload.findOptions, // The find options passed to the query, such as filter or params
    payload.many, // Boolean indicating if the query is for many items or one item
    payload.getResult, // A function to get the result of the query
    payload.setResult, // A function to update the result of the query
  )
})
```
