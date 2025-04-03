# Federation & Multi-sources

To implement multiple data sources, we can use the `scopeId` of the models and the plugins to specify the source of the data. Plugins process all models that share their `scopeId`.

## Models

The scope ID allows filtering which plugins will handle the model. For example, if a model has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

```ts{3}
const todoModel = defineDataModel({
  name: 'todos',
  scopeId: 'main-backend',
  // Only plugins with the scopeId 'main-backend'
  // will be able to handle this model by default
})
```

::: warning
If the scope ID is not defined, the model will be handled by all plugins.
:::

## Plugins

The scope ID allows filtering which plugins will handle the model. For example, if a model has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

```ts{3}
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'main-backend',
})
```

In the following example, the `fetchMany` hook will only be called with the models that have the `main-backend` scope ID:

```ts
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'main-backend',
  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      // This will only be called for models with the scopeId 'main-backend'
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
      // This will be called for all models regardless of their scopeId
    }, {
      ignoreScope: true,
    })
  }
})
```
