# Vite + Monospace

Use `@rstore/vite-monospace` to generate rstore collections and a Monospace REST plugin in a plain Vite/Vue app.

1. Install the packages:

::: code-group

```sh [npm]
npm install @rstore/vue @rstore/monospace @rstore/vite-monospace
```

```sh [pnpm]
pnpm add @rstore/vue @rstore/monospace @rstore/vite-monospace
```

:::

2. Configure the Vite plugin.

```ts
// vite.config.ts
import { rstoreMonospace } from '@rstore/vite-monospace'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    rstoreMonospace({
      url: 'https://your-monospace-instance.com',
      project: 'your-project',
      schemaApiKey: process.env.MONOSPACE_API_KEY,
      scopeId: 'rstore-monospace',
    }),
  ],
})
```

::: warning
`schemaApiKey` is used only for build-time OpenAPI loading and is not emitted in generated runtime modules. `runtimeApiKey` is emitted into client code when provided, so only use it for public/client-safe credentials.
:::

You can also generate from a local OpenAPI JSON file:

```ts
rstoreMonospace({
  url: 'https://your-monospace-instance.com',
  project: 'your-project',
  input: './openapi.json',
})
```

3. Create your rstore with the generated schema and plugin.

```ts
import { createStore, RstorePlugin } from '@rstore/vue'
import { monospacePlugin, schema } from 'virtual:rstore-monospace'
import { createApp } from 'vue'
import App from './App.vue'

const store = await createStore({
  schema,
  plugins: [monospacePlugin],
})

const app = createApp(App)
app.use(RstorePlugin, { store })
app.mount('#app')
```

The generated virtual modules are:

- `virtual:rstore-monospace`: re-exports `schema`, `monospace`, and `monospacePlugin`
- `virtual:rstore-monospace/schema`: exports the generated rstore schema
- `virtual:rstore-monospace/plugin`: exports the Monospace REST client and rstore plugin

By default, the plugin writes `rstore-monospace.d.ts` in the Vite root so TypeScript can resolve the virtual modules. Use `dts: false` to disable declaration output, or pass a string path to write declarations elsewhere.

```ts
rstoreMonospace({
  url: 'https://your-monospace-instance.com',
  project: 'your-project',
  schemaApiKey: process.env.MONOSPACE_API_KEY,
  dts: 'src/rstore-monospace.d.ts',
})
```

Queries accept Monospace REST query options in rstore find options:

```ts
const store = useStore()

const todos = await store.Todos.findMany({
  fields: ['id', 'title', 'completed'],
  filter: {
    completed: { _eq: false },
  },
  sort: [{ title: { direction: 'asc' } }],
  limit: 20,
})
```

The adapter uses Monospace REST endpoints directly:

- `GET /api/{project}/items/{collection}`
- `GET /api/{project}/items/{collection}/{id}`
- `POST /api/{project}/items/{collection}`
- `PATCH /api/{project}/items/{collection}/{id}`
- `PATCH /api/{project}/items/{collection}`
- `DELETE /api/{project}/items/{collection}/{id}`
- `DELETE /api/{project}/items/{collection}`

OpenAPI generation uses the Monospace schema endpoint documented in the [OpenAPI spec reference](https://docs.monospace.io/en/reference/api-reference/openapi-spec). Runtime CRUD follows the [Monospace API overview](https://docs.monospace.io/en/developer/api/overview).
