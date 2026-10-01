---
name: rstore-monospace
description: "Use when integrating rstore with Monospace REST and OpenAPI helpers, generated Monospace collections, Monospace REST query options, primary key overrides, createMonospaceRestClient, createMonospaceRstorePlugin, createMonospaceQuery, and schema generation from remote or local OpenAPI documents; also use before writing custom Monospace REST CRUD around rstore collections."
---

# Rstore Monospace

Use `@rstore/monospace` as the shared Monospace adapter layer for OpenAPI-generated rstore collections and REST-backed runtime CRUD behavior.

## Core APIs

| Area | API |
| --- | --- |
| Runtime client | `createMonospaceRestClient({ url, workspace, apiKey?, fetch?, cacheControl? })` |
| Runtime plugin | `createMonospaceRstorePlugin({ url?, workspace?, apiKey?, cacheControl?, client?, scopeId? })` |
| Query mapping | `createMonospaceQuery(findOptions, overrides?)` |
| Query serialization | `serializeMonospaceQuery(query)` |
| Mutation payloads | `stripPrimaryKeys(item, primaryKeys)`, `buildMonospaceRelationWrites` |
| Item keys | `resolveMonospaceItemKey`, `resolveMonospaceKeyValues`, `createMonospaceKeysFilter` |
| Collection metadata | `DEFAULT_MONOSPACE_SCOPE_ID`, `getMonospacePrimaryKeys`, `getMonospaceCollectionName` |
| Schema loading | `loadMonospaceCollections({ url?, workspace?, schemaApiKey?, input?, metadataInput?, primaryKeys?, scopeId? })` |
| Schema building | `buildMonospaceCollections({ document, metadata, primaryKeys?, scopeId })` |
| Code generation | `generateCollectionsTemplate`, `generateItemsTemplate`, `generateTypedCollectionsTemplate`, `generateConfigTemplate`, `generateViteDeclarations` |

## Workflow

1. Load the Monospace OpenAPI document and the schema metadata (schema structure endpoint) from a remote workspace or local JSON files.
2. Generate rstore collections from `x-monospace-mappings`, `*CollectionOutput` schemas, primary indexes, and FK constraints.
3. Create a runtime REST client with `createMonospaceRestClient`.
4. Register `createMonospaceRstorePlugin` in the store plugins list.
5. Query and mutate through rstore collection APIs instead of component-level REST calls.

## Schema Loading

- Generation requires both the OpenAPI document and the schema metadata (system meta collections: `MonospaceCollection`, `MonospacePrimitiveField`, `MonospaceSingleRelationField`, `MonospaceSingleConstraintField`, `MonospaceIndex`, `MonospaceIndexField`).
- Remote schema loading requires `url` and `workspace` (`project` is a deprecated alias). Metadata is read in one `GET /api/{workspace}/schema/structure/sources` request with explicit fields (never `*`: it would select data source credentials) and `limit=-1` on every to-many include.
- Fully local loading uses `input` (OpenAPI JSON) plus `metadataInput` (metadata snapshot keyed by meta collection name) and can skip remote schema credentials. `loadRemoteOpenApiDocument` / `loadRemoteSchemaMetadata` return JSON ready to write as these snapshots.
- Generated `meta.monospace` carries `itemRoutes: false` (no `/{key}` routes), `operations` (only when some are not served, read from the OpenAPI path methods), and `int64Fields` (64-bit integers, typed `string` since responses return decimal strings).
- `schemaApiKey` is only for build-time schema loading and needs the `openApiSchema:read` and `dataModel:read` entitlements.
- Primary keys come from each collection's primary index (ordered, composite supported); `primaryKeys` is an override only, and a collection without a primary index and without an override fails generation.
- Relations join on the real FK constraint columns (`on` maps target columns to source FK columns).

## Runtime REST Behavior

- The runtime client calls endpoints under `/api/{workspace}/items/{collection}`.
- Supported item operations include read one, read many, create one, create many, update one, update many, delete one, and delete many.
- Bulk update and delete require a non-empty filter query.
- Primary key fields are stripped from update payloads before REST mutation calls.
- Create and update requests send `fields=*`; Monospace returns no written item without `fields`.
- Object keys (`{ a: 1, b: 2 }`) use filtered collection requests (`?filter[a][_eq]=1&filter[b][_eq]=2`, `limit=1` on reads) because composite keys cannot go in the URL path. The plugin resolves composite keys and collections with `meta.monospace.itemRoutes: false` to object keys (cached item, then mutated item, then splitting the generated `a::b` key); `deleteMany` sends one filtered `DELETE`.
- Create bodies never carry FK columns (Monospace create inputs reject them): to-one connects and FK column values become `{ relation: { _connect: { key } } }`, null FK columns are omitted. Update bodies keep FK column writes. To-many operations are arrays in both modes.
- `cacheControl: 'no-cache'` sends `Cache-Control: no-cache` to bypass the server-side read cache.
- Monospace REST errors are mapped to typed errors (validation, auth, license `402`, permission, not-found). The message appends the innermost `source` message to generic top-level messages, `code` is the deepest code in the `source` chain, and `MonospaceLicenseError.violations` exposes `meta.violations`.

## Query Behavior

- Pass Monospace REST query options in rstore find options: `fields`, `filter`, `sort`, `limit`, `offset`, and `params`.
- `pageIndex` and `pageSize` map to `offset` and `limit` when explicit pagination is not provided.
- `createMonospaceQuery` merges adapter `params`, top-level find options, and optional overrides.
- `createMonospaceReadQuery` builds read requests: `fields` defaults to `['*']` (Monospace 1.0 rejects reads without a selection) and rstore `include` maps to the Monospace `include` parameter (`include[author][fields]=*`, nested `include[author][include][todos][fields]=*`). To-many includes get `limit: -1` so embedded lists are not truncated at 100 items.
- Explicit `fields` get the FK columns backing included relations appended; narrowed include `fields` get join and primary key columns.
- Raw Monospace include options go in `params.include` and are deep-merged over the generated include (user values win). Filtered, paginated, or aliased includes always fetch.
- `deep` and `alias` no longer exist in Monospace 1.0; aliases are `responseName:sourceField` entries in `fields`.
- `sort` is sent in the object form `sort[0][field][direction]=desc`; `'field'`, `'-field'`, and `{ field: 'desc' }` are normalized to it.
- `serializeMonospaceQuery` converts nested query options into URL search parameters, comma-joining `fields` at every include level.

## Guardrails

1. Keep `schemaApiKey` build/server-side; it is for OpenAPI loading.
2. Treat `runtimeApiKey` or `apiKey` as emitted runtime/client code when configured.
3. Prefer the generated rstore plugin over ad hoc Monospace REST calls for generated collections.
4. Use `rstore-vue` for query, live query, form, and cache semantics.
5. Use `rstore-vite-monospace` or `rstore-nuxt-monospace` for framework wiring.
