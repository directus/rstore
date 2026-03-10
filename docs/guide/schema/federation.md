# Federation & Multi-sources

When you need multiple data sources, use `scopeId` on both collections and plugins. A plugin only processes collections with matching `scopeId` (unless `ignoreScope` is enabled).

## Collections

Use `scopeId` to route a collection to the correct backend plugin.

```ts{3}
const todoCollection = defineCollection({
  name: 'todos',
  scopeId: 'main-backend',
  // Only plugins with the scopeId 'main-backend'
  // will be able to handle this collection by default
})
```

::: warning
If the scope ID is not defined, the collection will be handled by all plugins.
:::

## Plugins

Apply the same `scopeId` on the plugin side.

```ts{3}
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'main-backend',
})
```

In the following example, the `fetchMany` hook will only be called with the collections that have the `main-backend` scope ID:

```ts
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'main-backend',
  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      // This will only be called for collections with the scopeId 'main-backend'
    })
  }
})
```

You can opt-out of the filtering with the `ignoreScope` option of the hooks:

```ts
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'main-backend',
  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      // This will be called for all collections regardless of their scopeId
    }, {
      ignoreScope: true,
    })
  }
})
```

## Typical pattern

Use separate scopes for each backend, then add one plugin per scope.

```ts
// Collections
defineCollection({ name: 'users', scopeId: 'main-api' })
defineCollection({ name: 'auditLogs', scopeId: 'analytics-api' })

// Plugins
definePlugin({ name: 'main-api-plugin', scopeId: 'main-api' })
definePlugin({ name: 'analytics-plugin', scopeId: 'analytics-api' })
```
