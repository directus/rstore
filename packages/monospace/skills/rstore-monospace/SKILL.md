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
| Schema loading | `loadMonospaceCollections({ url?, project?, schemaApiKey?, input?, metadataInput?, primaryKeys?, scopeId? })` |
| Schema building | `buildMonospaceCollections({ document, metadata, primaryKeys?, scopeId })` |
| Code generation | `generateCollectionsTemplate`, `generateItemsTemplate`, `generateTypedCollectionsTemplate`, `generateConfigTemplate`, `generateViteDeclarations` |

## Workflow

1. Load the Monospace OpenAPI document and the system schema metadata (meta collections read through the items API) from a remote project or local JSON files.
2. Generate rstore collections from `x-monospace-mappings`, `*CollectionOutput` schemas, primary indexes, and FK constraints.
3. Create a runtime REST client with `createMonospaceRestClient`.
4. Register `createMonospaceRstorePlugin` in the store plugins list.
5. Query and mutate through rstore collection APIs instead of component-level REST calls.

## Schema Loading

- Generation requires both the OpenAPI document and the schema metadata (system meta collections: `MonospaceCollection`, `MonospacePrimitiveField`, `MonospaceSingleRelationField`, `MonospaceSingleConstraintField`, `MonospaceIndex`, `MonospaceIndexField`).
- Remote schema loading requires `url` and `project`; metadata queries use explicit `fields` and `limit=0` (unlimited).
- Fully local loading uses `input` (OpenAPI JSON) plus `metadataInput` (metadata snapshot keyed by meta collection name) and can skip remote schema credentials.
- `schemaApiKey` is only for build-time schema loading and needs the `openApiSchema:read` and `dataModel:read` entitlements.
- Primary keys come from each collection's primary index (ordered, composite supported); `primaryKeys` is an override only, and a collection without a primary index and without an override fails generation.
- Relations join on the real FK constraint columns (`on` maps target columns to source FK columns).

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
