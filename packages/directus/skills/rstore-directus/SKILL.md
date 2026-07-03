---
name: rstore-directus
description: "Use when integrating rstore with Directus runtime/schema helpers, generated Directus collections, Directus REST query options, cache-side Directus filtering, singleton handling, primary key stripping, and Directus-backed create/update/delete behavior; also use before writing custom Directus fetch or mutation code around rstore collections. Pair with rstore-vue for collection/query/form semantics and with framework-specific Directus skills for Vite or Nuxt wiring."
---

# Rstore Directus

Use `@rstore/directus` as the shared Directus adapter layer for generated rstore collections and runtime CRUD behavior.

## Core APIs

| Area | API |
| --- | --- |
| Runtime client | `createDirectusClient({ url })` |
| Runtime plugin | `createDirectusRstorePlugin({ url?, client?, scopeId? })` |
| Query mapping | `createDirectusQuery(findOptions, overrides?)` |
| Mutation payloads | `stripPrimaryKeys(item, primaryKeys)` |
| Cache filtering | `evaluateDirectusFilter`, `applyDirectusQuery` |
| Collection metadata | `DEFAULT_DIRECTUS_SCOPE_ID`, `isDirectusSingleton`, `getDirectusPrimaryKeys` |
| Schema loading | `loadDirectusCollections({ url, adminToken, scopeId? })` |
| Schema building | `buildDirectusCollections({ collections, fields, relations, scopeId })` |
| Code generation | `generateCollectionsTemplate`, `generateItemsTemplate`, `generateTypedCollectionsTemplate`, `generateConfigTemplate`, `generateViteDeclarations` |

## Workflow

1. Load Directus metadata at build time with `loadDirectusCollections`.
2. Generate rstore collections from Directus collections, fields, and relations.
3. Create a Directus runtime client with `createDirectusClient`.
4. Register `createDirectusRstorePlugin` in the store plugins list.
5. Query and mutate through rstore collection APIs instead of direct component-level Directus SDK calls.

## Query Behavior

- Pass Directus global query parameters in rstore find options: `filter`, `fields`, `search`, `sort`, `limit`, `offset`, `page`, `deep`, `alias`, `backlink`, `version`, and `versionRaw`.
- `pageIndex` and `pageSize` map to Directus `offset` and `limit` when explicit Directus pagination is not provided.
- `createDirectusQuery` merges adapter `params`, top-level find options, and optional overrides.
- Supported Directus filters, sort, and pagination can be evaluated against cache data through `applyDirectusQuery`.
- Unsupported cache-side query shapes fall through to Directus fetches instead of returning possibly wrong cached results.

## Generated Collections

- Directus system collections and collections without schema are skipped during metadata loading.
- Generated collection names mirror Directus collection names.
- Generated metadata stores Directus collection name, singleton state, and primary keys.
- Many-to-one foreign key fields stay scalar in the cache.
- Alias-side relations are generated only when Directus exposes a non-colliding alias field.
- Directus singleton collections use singleton read/update APIs and one stable local key.

## Mutation Behavior

- `createDirectusRstorePlugin` handles create, createMany, update, updateMany, delete, and deleteMany hooks for Directus-scoped collections.
- Primary key fields are stripped from update payloads before Directus mutation calls.
- Singleton collections use singleton update behavior and do not support normal delete paths.

## Guardrails

1. Keep `adminToken` build/server-side. It is for introspection only and must not be emitted into runtime client code.
2. Do not hand-write parallel Directus CRUD paths for generated collections unless the route is intentionally outside rstore.
3. Prefer plugin hooks and collection APIs over ad hoc Directus SDK calls in components.
4. Use `rstore-vue` for query, live query, form, and cache semantics.
5. Use `rstore-vite-directus` or Nuxt integration docs for framework wiring.
