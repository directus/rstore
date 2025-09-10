# Federation & Multi-sources

To implement multiple data sources, we can use the `scopeId` of the collections and the plugins to specify the source of the data. Plugins process all collections that share their `scopeId`.

## Collections

The scope ID allows filtering which plugins will handle the collection. For example, if a collection has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

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

The scope ID allows filtering which plugins will handle the collection. For example, if a collection has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

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
