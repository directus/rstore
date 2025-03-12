# Federation & Multi-sources

To implement multiple data sources, we can use the `meta` object of the models to specify the source of the data. Plugins process all models, which means that they can be scoped to a specific set of models depending on the `meta` object using conditional logic.

For example, we could create a `sourceId` property in the `meta` object of the models.

If you are using TypeScript, you can augment the `CustomModelMeta` interface:

```ts
declare module '@rstore/vue' {
  export interface CustomModelMeta {
    sourceId?: string
  }
}

export {}
```

In the models you can add the `sourceId` property to the `meta` object:

::: code-group

```js [model.js]
import { defineDataModel } from '@rstore/vue'

export const todoModel = defineDataModel({
  name: 'todos',
  meta: {
    sourceId: 'app1',
  },
})
```

```ts [model.ts]
import { defineItemType } from '@rstore/vue'

export const todoModel = defineItemType<Todo>().model({
  name: 'todos',
  meta: {
    sourceId: 'app1',
  },
})
```

:::

Then, in the plugin, you can use the `sourceId` property to filter the models:

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'app1-plugin',
  setup({ hook }) {
    hook('fetchFirst', async (payload) => {
      if (payload.model.meta?.sourceId === 'app1') {
        // Fetch data from the app1 source
      }
    })
  },
})
```

Since rstore all models and all plugins are processed in the same context by design, all items from multiple sources can seamlessly load relations from other sources.
