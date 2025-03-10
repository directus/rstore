<img src="/logo.svg" alt="rstore logo" width="100px" height="100px" style="margin: 0 auto 42px auto;">

# About rstore

rstore is a powerful data store that allows you to manage all the data in your application efficiently.

With rstore, you can define a data model and then run queries or execute mutations (create, update, and delete) on your data seamlessly.

Its main features include:

- **Normalized reactive cache**: Ensures that all components are always up-to-date with the latest data changes.
- **Fully adaptable**: Comes with plugins that allow you to fetch data from any source, including REST and GraphQL.
- **Scalable**: Suitable for both small prototypes and large enterprise applications, allowing you to scale down or up as needed.
- **Local-first and realtime query API**: Designed to prioritize local data access and provide real-time updates.
- **TypeScript support**: Offers full autocomplete and type safety, making development more efficient and error-free.

Whether you're building a small prototype or a large-scale enterprise application, rstore provides the tools you need to manage your data effectively.

## Use Cases

Here are some use cases for which rstore can be a great data management solution.

### Small apps and prototypes

rstore is perfect for small applications and prototypes due to its simplicity and progressiveness. You can quickly set up a data model and start managing your data with a simple plugin to handle all REST calls. You can then take advantage of the powerful API provided by the store and quickly add more Models to your app as it grows. The reactive cache ensures that your UI components are always in sync with the latest data, making development simpler and less bug-prone.

### Enterprise

For large-scale applications, rstore offers scalability, performance and extensibility. Its normalized reactive cache and plugin system allow you to manage complex data relationships and fetch data from various sources efficiently. You can scale your application as needed, from small prototypes to large enterprise solutions, without compromising on performance or maintainability.

### Data Federation

rstore's plugin system supports data federation, allowing you to fetch and combine data from multiple sources seamlessly. Whether you need to integrate REST APIs, GraphQL endpoints, or other data sources, rstore provides the flexibility to create a unified data layer for your application. This is particularly useful for applications that require data from different services or databases.

### Offline

With rstore, you can build applications that work offline by prioritizing local data access. The local-first query API ensures that your application can continue to function even when there is no network connectivity as long as all necessary data is written into the cache. Data can be synchronized with remote sources when the connection is restored, providing a seamless offline experience for users.

### Realtime and collaboration

rstore design makes it easy to add support for real-time updates and collaboration to your app *(and soon with more realtime features built into rstore)*, making it ideal for applications that require live data synchronization. The reactive cache ensures that any changes to the data are immediately reflected in the UI, and the mutation history allows replaying mutations in sync engines. Examples of realtime applications: chat apps, collaborative document editors, and other real-time interactive tools.

## Cache

The reactive normalized cache in rstore is a key feature that ensures your application's data is always consistent and up-to-date. This cache automatically normalizes the data, meaning it stores data in a structured format that eliminates redundancy and allows maintaining relationships between different items.

The cache is also reactive, meaning reading from the cache in a `computed` will always keep the components updated. In fact, each time you use `store.Todo.queryMany()` you get a computed ref that reads from the cache.

The reactive normalized cache in rstore offers several benefits.
- Consistency is maintained by normalizing the data, ensuring a single source of truth for each item, which prevents duplication and inconsistencies.
- Reactivity is another advantage, as the cache automatically updates any part of your application that depends on the data whenever changes occur, keeping your UI in sync with the latest state.
- Efficiency is achieved through the structured format of normalized data, allowing for quicker and less overhead-intensive queries and updates.
- Co-locating the data requirements with the components that use them is a powerful pattern. By using the `queryMany` and `queryFirst` composables, you can easily fetch and display data in your components without worrying about deduplicating or synchronizing with other components.

::: details Example of cache

Here is what the cache can look like:

```json
{
  "Todo": {
    "4d1c0f97-4821-4012-a843-511536d64038": {
      "id": "4d1c0f97-4821-4012-a843-511536d64038",
      "completed": true,
      "text": "Meow",
      "createdAt": "2025-03-07T11:11:35.909Z",
      "updatedAt": "2025-03-07T11:12:31.659Z"
    },
    "fd50e81f-5423-4d6a-8120-2a388a9fbdfd": {
      "id": "fd50e81f-5423-4d6a-8120-2a388a9fbdfd",
      "completed": false,
      "text": "Waf",
      "createdAt": "2025-03-07T11:12:11.630Z"
    }
  }
}
```

:::

## Plugins

rstore's plugin system is designed to be highly adaptable, allowing you to fetch data from any source without making any assumptions about how the data should be retrieved. This flexibility ensures that rstore can be integrated seamlessly into any existing architecture or workflow.

Multiple plugins can be added to a store allowing an architecture that primarily reads from a local data source (such as local storage or IndexedDB) and then fallbacks to a remote API. Data can also be synchronized upfront and all reads can happend on a local data source.

::: info
In the future rstore will provide some builtin plugins for GraphQL, OpenAPI and other popular standards. Feel free to also share your own plugins with the community! 😸
:::

::: details

The flexibility of the plugin system allows you to fetch data from various sources such as REST APIs, GraphQL endpoints, WebSockets, or even local storage. This means you are not locked into a specific data-fetching strategy and can choose the best tool for your needs.

Here is an example of how you might configure a plugin to fetch data from a REST API in Nuxt:

```js
export default definePlugin({
  name: 'my-rstore-plugin',

  setup({ hook }) {
    hook('fetchFirst', async (payload) => {
      if (payload.key) {
        const result = await $fetch(`/api/${payload.model.name}/${payload.key}`)
        payload.setResult(result)
      }
    })

    hook('fetchMany', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}`)
      payload.setResult(result)
    })

    hook('createItem', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}`, {
        method: 'POST',
        body: payload.item,
      })
      payload.setResult(result)
    })

    hook('updateItem', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'PATCH',
        body: payload.item,
      })
      payload.setResult(result)
    })

    hook('deleteItem', async (payload) => {
      await $fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'DELETE',
      })
    })
  },
})
```

:::
