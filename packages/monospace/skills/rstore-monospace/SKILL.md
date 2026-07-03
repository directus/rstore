---
name: rstore-monospace
description: "Use when integrating rstore with Monospace REST and OpenAPI helpers, generated Monospace collections, Monospace REST query options, primary key overrides, createMonospaceRestClient, createMonospaceRstorePlugin, createMonospaceQuery, and schema generation from remote or local OpenAPI documents; also use before writing custom Monospace REST CRUD around rstore collections."
---

# Rstore Monospace

Use `@rstore/monospace` as the shared Monospace adapter layer for OpenAPI-generated rstore collections and REST-backed runtime CRUD behavior.

## Core APIs

| Area | API |
| --- | --- |
| Runtime client | `createMonospaceRestClient({ url, project, apiKey?, fetch? })` |
| Runtime plugin | `createMonospaceRstorePlugin({ url?, project?, apiKey?, client?, scopeId? })` |
| Query mapping | `createMonospaceQuery(findOptions, overrides?)` |
| Query serialization | `serializeMonospaceQuery(query)` |
| Mutation payloads | `stripPrimaryKeys(item, primaryKeys)` |
| Collection metadata | `DEFAULT_MONOSPACE_SCOPE_ID`, `getMonospacePrimaryKeys`, `getMonospaceCollectionName` |
| Schema loading | `loadMonospaceCollections({ url?, project?, schemaApiKey?, input?, primaryKeys?, scopeId? })` |
| Schema building | `buildMonospaceCollections({ document, primaryKeys?, scopeId })` |
| Code generation | `generateCollectionsTemplate`, `generateItemsTemplate`, `generateTypedCollectionsTemplate`, `generateConfigTemplate`, `generateViteDeclarations` |

## Workflow

1. Load Monospace OpenAPI metadata from a remote project or local JSON file.
2. Generate rstore collections from `x-monospace-mappings` and `*CollectionOutput` schemas.
3. Create a runtime REST client with `createMonospaceRestClient`.
4. Register `createMonospaceRstorePlugin` in the store plugins list.
5. Query and mutate through rstore collection APIs instead of component-level REST calls.

## Schema Loading

- Remote schema loading requires `url` and `project`.
- Local schema loading uses `input` and can skip remote schema credentials.
- `schemaApiKey` is only for build-time OpenAPI loading.
- `primaryKeys` overrides generated primary keys by collection name and accepts a string or string array.
- Generated collections default to `id` when no explicit primary key is available.

## Runtime REST Behavior

- The runtime client calls endpoints under `/api/{project}/items/{collection}`.
- Supported item operations include read one, read many, create one, create many, update one, update many, delete one, and delete many.
- Bulk update and delete require a non-empty filter query.
- Primary key fields are stripped from update payloads before REST mutation calls.
- Monospace REST errors are mapped to typed errors such as auth, permission, validation, and not-found errors.

## Query Behavior

- Pass Monospace REST query options in rstore find options: `fields`, `filter`, `sort`, `limit`, `offset`, and `params`.
- `pageIndex` and `pageSize` map to `offset` and `limit` when explicit pagination is not provided.
- `createMonospaceQuery` merges adapter `params`, top-level find options, and optional overrides.
- `serializeMonospaceQuery` converts nested query options into URL search parameters.

## Guardrails

1. Keep `schemaApiKey` build/server-side; it is for OpenAPI loading.
2. Treat `runtimeApiKey` or `apiKey` as emitted runtime/client code when configured.
3. Prefer the generated rstore plugin over ad hoc Monospace REST calls for generated collections.
4. Use `rstore-vue` for query, live query, form, and cache semantics.
5. Use `rstore-vite-monospace` or `rstore-nuxt-monospace` for framework wiring.
