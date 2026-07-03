---
name: rstore-vite-monospace
description: "Use when wiring Monospace into a plain Vite/Vue app with @rstore/vite-monospace, including rstoreMonospace config, remote or local OpenAPI generation, virtual:rstore-monospace modules, generated rstore-monospace.d.ts declarations, runtimeApiKey handling, primaryKeys, and store setup with the generated schema and monospacePlugin."
---

# Rstore Vite Monospace

Use `@rstore/vite-monospace` to generate Monospace-backed rstore schema and plugin modules in a non-Nuxt Vite app.

## Setup

Register the Vite plugin in `vite.config.ts`:

```ts
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

Then create the store from the generated virtual module:

```ts
import { createStore, RstorePlugin } from '@rstore/vue'
import { monospacePlugin, schema } from 'virtual:rstore-monospace'

const store = await createStore({
  schema,
  plugins: [monospacePlugin],
})

app.use(RstorePlugin, { store })
```

## Options

| Option | Purpose |
| --- | --- |
| `url` | Monospace API URL used for remote schema loading and runtime client code |
| `project` | Monospace project identifier |
| `schemaApiKey` | Build-time key for remote OpenAPI loading |
| `input` | Local OpenAPI JSON path, resolved from the Vite root |
| `runtimeApiKey` | Runtime API key emitted into generated client code |
| `scopeId` | rstore plugin scope id, defaulting to `rstore-monospace` |
| `primaryKeys` | Explicit primary key overrides by collection name |
| `dts` | Declaration output path, `true`/omitted for `rstore-monospace.d.ts`, or `false` to disable |

## Virtual Modules

- `virtual:rstore-monospace` re-exports `schema`, `monospace`, and `monospacePlugin`.
- `virtual:rstore-monospace/schema` exports the generated rstore schema.
- `virtual:rstore-monospace/plugin` exports the Monospace REST client and rstore plugin.

## Local OpenAPI Mode

Use `input` when the schema is checked into the project or generated separately:

```ts
rstoreMonospace({
  url: 'https://your-monospace-instance.com',
  project: 'your-project',
  input: './openapi.json',
})
```

## Guardrails

1. Keep `schemaApiKey` build-time only; it must not appear in generated virtual modules.
2. Configure `runtimeApiKey` only when the key is safe to emit into runtime/client code.
3. Do not hand-write replacement schema or plugin virtual modules; fix generator input/config instead.
4. Use the generated `schema` and `monospacePlugin` together in the same store.
5. Use `rstore-monospace` for OpenAPI, REST, query, and mutation behavior.
6. Use `rstore-vue` for component query/form/cache patterns.
