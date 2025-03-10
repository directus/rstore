# Plugin Setup

Plugins allow you to extend the functionality of the store. You can create your own plugins or use existing ones. The main use case for plugins is to add support for different data sources, such as REST APIs, GraphQL APIs, or local storage. Plugins can also be used to add support for different data formats, such as JSON, XML, or CSV.

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
        const result = await fetch(`/api/${payload.model.name}/${payload.key}`)
          .then(r => r.json())
        payload.setResult(result)
      }
    })

    pluginApi.hook('fetchMany', async (payload) => {
      const result = await fetch(`/api/${payload.model.name}`)
        .then(r => r.json())
      payload.setResult(result)
    })
  },
})
```

Explore the [Plugin hooks](./hooks.md) for a complete list of available hooks.

## Adding model defaults

Plugins can define default options for all models using the `addModelDefaults` method:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-rstore-plugin',
  setup() {
    addModelDefaults({
      getKey: (modelName, item) => item.customId,
      // ...
    })
  }
})
```
