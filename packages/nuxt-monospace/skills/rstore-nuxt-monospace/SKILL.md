---
name: rstore-nuxt-monospace
description: "Use when wiring Monospace into a Nuxt app with @rstore/nuxt-monospace, including rstoreMonospace config, remote or local OpenAPI generation, generated #build templates, runtime plugin setup, auto-imported useMonospace, runtimeApiKey handling, primaryKeys, and generated rstore collections. Pair with rstore-monospace for shared REST/OpenAPI behavior, rstore-nuxt for Nuxt store integration, and rstore-vue for query/form usage."
---

# Rstore Nuxt Monospace

Use `@rstore/nuxt-monospace` to generate Monospace-backed rstore collections and register the runtime REST plugin in Nuxt.

## Setup

Register the Nuxt module:

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

Use generated collections through `useStore()`:

```ts
const store = useStore()

const { data } = await store.Todos.query(q => q.many({
  fields: ['id', 'title'],
  limit: 20,
}))
```

Use the auto-imported REST client when direct Monospace access is intentional:

```ts
const monospace = useMonospace()
const todos = await monospace.readMany('Todos', { limit: 10 })
```

## Options

| Option | Purpose |
| --- | --- |
| `url` | Monospace API URL |
| `project` | Monospace project identifier |
| `schemaApiKey` | Build-time key for remote OpenAPI loading |
| `input` | Local OpenAPI JSON path, resolved from Nuxt root |
| `runtimeApiKey` | Runtime API key emitted into generated config |
| `scopeId` | rstore plugin scope id, defaulting to `rstore-monospace` |
| `primaryKeys` | Explicit primary key overrides by collection name |

## Generated Nuxt Templates

- `$rstore-monospace-collections.js` contains runtime collection definitions.
- `$rstore-monospace-items.d.ts` contains generated item interfaces.
- `$rstore-monospace-collections.d.ts` contains typed collection declarations.
- `$rstore-monospace-config.js` contains runtime URL, project, optional API key, and scope id.

## Module Behavior

- The module depends on `@rstore/nuxt`.
- It adds generated collections through `addCollectionImport`.
- It adds the runtime plugin through `addPluginImport`.
- It registers runtime type references and auto-imports `useMonospace()`.
- Missing `url` or `project` skips collection generation with a warning.

## Guardrails

1. Keep `schemaApiKey` server-side/build-time.
2. Configure `runtimeApiKey` only when the value is safe to expose through generated runtime config.
3. Use `input` for checked-in or separately generated OpenAPI schemas.
4. Prefer generated rstore collections and plugin wiring over custom Nuxt API routes for generated collections.
5. Use `rstore-monospace` for shared OpenAPI, REST, query, and mutation behavior.
6. Use `rstore-nuxt` for base Nuxt rstore module behavior and `rstore-vue` for query/form/cache semantics.
