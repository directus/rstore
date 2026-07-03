---
name: rstore-vite-directus
description: "Use when wiring Directus into a plain Vite/Vue app with @rstore/vite-directus, including rstoreDirectus config, virtual:rstore-directus modules, generated rstore-directus.d.ts declarations, build-time Directus introspection, and store setup with the generated schema and directusPlugin. Pair with rstore-directus for shared Directus adapter behavior and rstore-vue for collection/query/form usage."
---

# Rstore Vite Directus

Use `@rstore/vite-directus` to generate Directus-backed rstore schema and plugin modules in a non-Nuxt Vite app.

## Setup

Register the Vite plugin in `vite.config.ts`:

```ts
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

Then create the store from the generated virtual module:

```ts
import { createStore, RstorePlugin } from '@rstore/vue'
import { directusPlugin, schema } from 'virtual:rstore-directus'

const store = await createStore({
  schema,
  plugins: [directusPlugin],
})

app.use(RstorePlugin, { store })
```

## Options

| Option | Purpose |
| --- | --- |
| `url` | Directus API URL used for schema loading and runtime client code |
| `adminToken` | Build-time Directus admin token for introspection |
| `scopeId` | rstore plugin scope id, defaulting to `rstore-directus` |
| `dts` | Declaration output path, `true`/omitted for `rstore-directus.d.ts`, or `false` to disable |

## Virtual Modules

- `virtual:rstore-directus` re-exports `schema`, `directus`, and `directusPlugin`.
- `virtual:rstore-directus/schema` exports the generated rstore schema.
- `virtual:rstore-directus/plugin` exports the Directus SDK client and rstore plugin.

## Generated Declarations

- The plugin writes `rstore-directus.d.ts` in the Vite root by default.
- Use `dts: 'src/rstore-directus.d.ts'` to choose another output.
- Use `dts: false` only when the app provides compatible virtual module declarations another way.

## Guardrails

1. Keep `adminToken` server-side/build-time. The Vite plugin should not emit it into generated modules.
2. Do not hand-write replacement schema or plugin virtual modules; fix generator input/config instead.
3. Use the generated `schema` and `directusPlugin` together in the same store.
4. Use `rstore-directus` for Directus query, schema, singleton, and mutation behavior.
5. Use `rstore-vue` for component query/form/cache patterns.
