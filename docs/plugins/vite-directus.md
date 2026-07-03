# Vite + Directus

Use `@rstore/vite-directus` to generate rstore collections and a Directus plugin in a plain Vite/Vue app.

1. Install the packages:

::: code-group

```sh [npm]
npm install @rstore/vue @rstore/directus @rstore/vite-directus
```

```sh [pnpm]
pnpm add @rstore/vue @rstore/directus @rstore/vite-directus
```

:::

2. Create a Directus admin token for build-time introspection.

```txt
DIRECTUS_TOKEN=<paste-your-token-here>
```

3. Register the Vite plugin.

```ts
// vite.config.ts
import { rstoreDirectus } from '@rstore/vite-directus'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    rstoreDirectus({
      url: 'https://your-directus-instance.com',
      adminToken: process.env.DIRECTUS_TOKEN,
      scopeId: 'rstore-directus',
    }),
  ],
})
```

::: warning
Keep the admin token server-side only. The Vite plugin uses it during build-time introspection and does not emit it in generated runtime modules.
:::

4. Create your rstore with the generated schema and plugin.

```ts
import { createStore, RstorePlugin } from '@rstore/vue'
import { directusPlugin, schema } from 'virtual:rstore-directus'
import { createApp } from 'vue'
import App from './App.vue'

const store = await createStore({
  schema,
  plugins: [directusPlugin],
})

const app = createApp(App)
app.use(RstorePlugin, { store })
app.mount('#app')
```

The generated virtual modules are:

- `virtual:rstore-directus`: re-exports `schema`, `directus`, and `directusPlugin`
- `virtual:rstore-directus/schema`: exports the typed generated rstore schema
- `virtual:rstore-directus/plugin`: exports the Directus SDK client and rstore plugin

By default, the plugin writes `rstore-directus.d.ts` in the Vite root so TypeScript can resolve the virtual modules. Use `dts: false` to disable declaration output, or pass a string path to write declarations elsewhere.

```ts
rstoreDirectus({
  url: 'https://your-directus-instance.com',
  adminToken: process.env.DIRECTUS_TOKEN,
  dts: 'src/rstore-directus.d.ts',
})
```

Queries accept Directus global query parameters in rstore find options:

```ts
const store = useStore()

const todos = await store.Todos.findMany({
  filter: {
    completed: { _eq: false },
  },
  fields: ['id', 'title', 'completed'],
  sort: ['-date_created'],
  limit: 20,
})
```

Supported query and cache-filter behavior matches the Nuxt Directus module: Directus filters, sorting, pagination, singleton reads/updates, primary-key stripping, and safe alias-side relations are generated from Directus metadata.
