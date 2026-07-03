# Nuxt + Monospace

Use `@rstore/nuxt-monospace` to generate rstore collections from Monospace OpenAPI and register a Monospace REST plugin in Nuxt.

1. Install the module:

::: code-group

```sh [npm]
npm install @rstore/nuxt-monospace
```

```sh [pnpm]
pnpm add @rstore/nuxt-monospace
```

:::

2. Configure Nuxt.

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-monospace',
  ],

  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    project: 'your-project',
    schemaApiKey: process.env.MONOSPACE_API_KEY,
    scopeId: 'rstore-monospace',
  },
})
```

::: warning
Keep `schemaApiKey` server-side. It is used by the Nuxt module during build-time OpenAPI loading and is not emitted in generated runtime modules. `runtimeApiKey` is emitted if configured.
:::

You can use a local OpenAPI file instead of fetching the schema:

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-monospace',
  ],

  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    project: 'your-project',
    input: './openapi.json',
  },
})
```

3. Use `useStore()` from your components.

```vue
<script lang="ts" setup>
const store = useStore()

const { data: todos } = await store.Todos.query(q => q.many({
  fields: ['id', 'title', 'completed'],
  filter: {
    completed: { _eq: false },
  },
}))
</script>
```

The module also auto-imports `useMonospace()`:

```ts
const monospace = useMonospace()
const todos = await monospace.readMany('Todos', {
  limit: 10,
})
```

## Query Options

Monospace REST query options can be passed directly in rstore find options:

```ts
const { data: todos } = await store.Todos.query(q => q.many({
  fields: ['id', 'title'],
  filter: {
    completed: { _eq: false },
  },
  sort: [{ title: { direction: 'asc' } }],
  limit: 20,
  offset: 0,
}))
```

rstore pagination options are mapped to REST requests: `pageIndex` and `pageSize` become `offset` and `limit` when explicit Monospace pagination is not provided.

## Generated Schema

At Nuxt build time, the module loads Monospace OpenAPI metadata from `GET /api/{project}/openapi` or a local JSON file. It generates rstore collections with:

- Primary key-aware `getKey` functions
- TypeScript item interfaces from `*CollectionOutput` schemas
- Monospace collection metadata used by the REST plugin

Generated collections default to `id` as the primary key. Use `primaryKeys` for collections that use another key:

```ts
export default defineNuxtConfig({
  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    project: 'your-project',
    primaryKeys: {
      Articles: 'slug',
    },
  },
})
```

The runtime plugin calls Monospace REST endpoints directly:

- `GET /api/{project}/items/{collection}`
- `GET /api/{project}/items/{collection}/{id}`
- `POST /api/{project}/items/{collection}`
- `PATCH /api/{project}/items/{collection}/{id}`
- `PATCH /api/{project}/items/{collection}`
- `DELETE /api/{project}/items/{collection}/{id}`
- `DELETE /api/{project}/items/{collection}`

OpenAPI generation uses the Monospace schema endpoint documented in the [OpenAPI spec reference](https://docs.monospace.io/en/reference/api-reference/openapi-spec). Runtime CRUD follows the [Monospace API overview](https://docs.monospace.io/en/developer/api/overview).
