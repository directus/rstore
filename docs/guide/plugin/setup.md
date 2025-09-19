# Plugin Setup

Plugins allow you to extend the functionality of the store. You can create your own plugins or use existing ones. The main use case for plugins is to add support for different data sources, such as REST APIs, GraphQL APIs, or local storage. Plugins can also be used to add support for different data formats, such as JSON, XML, or CSV.

::: info
In the future rstore will provide some builtin plugins for GraphQL, OpenAPI and other popular standards. Feel free to also share your own plugins with the community! 😸
:::

## Defining a plugin

To define a plugin, you can use the `definePlugin` helper to get auto-completion and type checking. The plugin is an object with a `name` and a `setup` function.

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-plugin',

  setup(pluginApi) {
    // Plugin code goes here
  },
})
```

The `setup` function is called when the plugin is registered. It receives a `pluginApi` object that contains useful methods to customize the store.

### Vue

You can then add plugins to your store when creating it:

```ts{10-12}
import { createStore } from '@rstore/vue'
import { todoCollection } from './collection'
import myPlugin from './plugin'

export async function setupRstore(app) {
  const store = await createStore({
    schema: [
      todoCollection,
    ],
    plugins: [
      myPlugin,
    ],
  })
}
```

### Nuxt

In Nuxt, you can add plugins by creating a file for each in the `app/rstore/plugins` directory. The plugin will be automatically registered when the store is created.

```
package.json
nuxt.config.ts
app/
  rstore/
    some-collection.ts
    plugins/
      my-plugin.ts
```

::: tip Nuxt Layers
You can also add an `app/rstore` folder in Nuxt layers! rstore will automatically add those files too.
:::

## Category <Badge text="New in v0.7" />

Plugins can be categorized to define their role in the data flow. The available categories are:

- `virtual`: Plugins that provide virtual/in-memory collections that do not have any persistent storage.
- `local`: Plugins that handle local data sources in the current device, such as saving it to a client-side database or storage such as IndexedDB or LocalStorage.
- `remote`: Plugins that handle remote data sources, such as REST APIs or GraphQL APIs.
- `processing`: Plugins that process data, such as transforming or validating it.

By default plugins will be sorted based on their category in the following order:

1. `virtual`
2. `local`
3. `remote`
4. `processing`

You can customize the sorting using the `before` and `after` options (see [Sorting plugins](#sorting-plugins)).

```ts{5-7}
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-plugin',
  // Will be after 'virtual' and 'local' plugins
  // and before 'processing' plugins
  category: 'remote',
  setup(pluginApi) {
    // Plugin code goes here
  },
})
```

## Hooks

Hooks are the primary way to extend the functionality of the store. They allow you to run custom code at different points in the lifecycle of the store. The hooks are called in the order they are defined.

To register a callback to a hook, you can use the `pluginApi.hook` method that takes the name of the hook and a callback function.

Example:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-plugin',

  setup(pluginApi) {
    pluginApi.hook('fetchFirst', async (payload) => {
      if (payload.key) {
        const result = await fetch(`/api/${payload.collection.name}/${payload.key}`)
          .then(r => r.json())
        payload.setResult(result)
      }
    })

    pluginApi.hook('fetchMany', async (payload) => {
      const result = await fetch(`/api/${payload.collection.name}`)
        .then(r => r.json())
      payload.setResult(result)
    })
  },
})
```

Explore the [Plugin hooks](./hooks.md) for a complete list of available hooks.

### Aborting hook <Badge text="New in v0.7" />

You can abort most the hooks by calling either `setResult()` with a non-null/non-empty value, or `abort()`. This will prevent the remaining plugins from running the same hook. This is useful when you want to short-circuit the data flow, for example when you have a cache plugin that can return the data without needing to call a remote API.

```ts
pluginApi.hook('fetchFirst', async (payload) => {
  // If the item is non-null,
  // remaining `fetchFirst` hooks will not be called
  payload.setResult(cachedmyCache.get(payload.key))
})
```

::: tip
You can prevent this behavior by setting `abort: false` to the second argument of `setResult()`.

```ts
payload.setResult(cachedmyCache.get(payload.key), { abort: false })
```

:::

```ts
pluginApi.hook('fetchFirst', async (payload) => {
  if (payload.collection.name === 'SomeSpecialCollection') {
    // Do something special here
    await doSomethingSpecial()
    // Remaining `fetchFirst` hooks will not be called
    payload.abort()
  }
})
```

See also [Category](#category) and [Sorting plugins](#sorting-plugins). Learn more in [Hooks](./hooks.md#aborting).

## Scope ID

The scope ID allows filtering which plugins will handle the collection. For example, if a collection has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

```ts{3}
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'my-scope',
})
```

In the following example, the `fetchMany` hook will only be called with the collections that have the `my-scope` scope ID:

```ts
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'my-scope',
  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      // This will only be called for collections with the scopeId 'my-scope'
    })
  }
})
```

You can opt-out of the filtering with the `ignoreScope` option of the hooks:

```ts
export default definePlugin({
  name: 'my-plugin',
  scopeId: 'my-scope',
  setup({ hook }) {
    hook('fetchMany', async (payload) => {
      // This will be called for all collections regardless of their scopeId
    }, {
      ignoreScope: true,
    })
  }
})
```

Learn more about federation and multi-source [here](../schema/federation.md).

## Adding collection defaults

Plugins can define default options for all collections using the `addCollectionDefaults` method:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-rstore-plugin',
  setup() {
    addCollectionDefaults({
      getKey: (collectionName, item) => item.customId,
      // ...
    })
  }
})
```

## Sorting plugins <Badge text="New in v0.7" />

Plugins are sorted based on their dependencies and category. You can specify that a plugin should be loaded before or after another plugin or category using the `before` and `after` options:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-plugin',
  before: {
    plugins: ['another-plugin'],
    categories: ['remote'],
  },
  after: {
    plugins: ['yet-another-plugin'],
    categories: ['virtual'],
  },
})
```

Each property of `before` and `after` is optional, you can either specify `plugins`, `categories`, or both.

::: warning
Be mindful of circular dependencies when using `before` and `after`. For example, if Plugin A is set to load after Plugin B, and Plugin B is set to load after Plugin A, this will create a circular dependency that cannot be resolved. The system will detect such circular dependencies and handle them gracefully by skipping the remaining sorting rules (with a warning printed to the console).

Prioritization is done in the following order:

- `before.plugins` and `after.plugins` have the highest priority.
- `before.categories` and `after.categories` have the next priority.
- Default category order is applied last.
:::
