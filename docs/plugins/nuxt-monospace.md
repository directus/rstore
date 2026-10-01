# Nuxt + Monospace

Use `@rstore/nuxt-monospace` to generate rstore collections from the Monospace schema (OpenAPI document + system schema metadata) and register a Monospace REST plugin in Nuxt.

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
    workspace: 'your-workspace',
    schemaApiKey: process.env.MONOSPACE_API_KEY,
    scopeId: 'rstore-monospace',
  },
})
```

At build time, the module loads **both** the OpenAPI document (`GET /api/{workspace}/openapi`) and the Monospace schema metadata, read in one request from the schema structure endpoint (`GET /api/{workspace}/schema/structure/sources`, including every data source's collections, fields, relation constraints and indexes). The metadata provides the true primary keys (primary indexes) and the real foreign key columns backing relations, so both sources are required for generation.

::: tip
Monospace renamed projects to workspaces. The `project` option is still accepted as a deprecated alias of `workspace`.
:::

::: warning
Keep `schemaApiKey` server-side. It is used by the Nuxt module during build-time schema loading and is not emitted in generated runtime modules. The key needs the `openApiSchema:read` entitlement (OpenAPI document) and the `dataModel:read` entitlement (schema structure). `runtimeApiKey` is emitted into client code if configured, so only use it for public/client-safe credentials.
:::

You can use local files instead of fetching the schema. Offline generation needs both the OpenAPI document (`input`) and a schema metadata snapshot (`metadataInput`):

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-monospace',
  ],

  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    workspace: 'your-workspace',
    input: './openapi.json',
    metadataInput: './schema-metadata.json',
  },
})
```

The metadata snapshot is a JSON object keyed by Monospace schema meta collection name, holding flat item arrays. Produce it with `loadRemoteSchemaMetadata`, which returns the snapshot ready to be written to disk:

```ts
// scripts/monospace-snapshot.ts
import { writeFile } from 'node:fs/promises'
import { loadRemoteOpenApiDocument, loadRemoteSchemaMetadata } from '@rstore/monospace/schema'

const options = {
  url: 'https://your-monospace-instance.com',
  workspace: 'your-workspace',
  schemaApiKey: process.env.MONOSPACE_API_KEY,
}
await writeFile('openapi.json', JSON.stringify(await loadRemoteOpenApiDocument(options), null, 2))
await writeFile('schema-metadata.json', JSON.stringify(await loadRemoteSchemaMetadata(options), null, 2))
```

The snapshot shape:

```json
{
  "MonospaceCollection": [{ "id": "…", "apiName": "Todos" }],
  "MonospacePrimitiveField": [{ "id": "…", "apiName": "author_id", "collectionId": "…" }],
  "MonospaceSingleRelationField": [{ "id": "…", "apiName": "author", "collectionId": "…", "oppositeCollectionId": "…", "isList": false, "isNullable": true, "constraintId": "…", "oppositeRelationFieldId": "…" }],
  "MonospaceSingleConstraintField": [{ "constraintId": "…", "constrainedFieldId": "…", "referencedFieldId": "…", "order": 0 }],
  "MonospaceIndex": [{ "id": "…", "kind": "primary", "collectionId": "…" }],
  "MonospaceIndexField": [{ "indexId": "…", "fieldId": "…", "order": 0 }]
}
```

It also lists system collections (`MonospaceSystemUser`, …), which are ignored unless the OpenAPI document exposes them. When only one of `input` / `metadataInput` is provided, the other source is loaded remotely (which then requires `url` and `workspace`).

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

The `fields`, `filter`, `sort`, `limit`, and `offset` options are read from the top level of find options. Other Monospace query parameters can be passed through `params`.

- Reads always send a field selection: `fields` defaults to `['*']` (Monospace 1.0 rejects reads without one). Aliases use the `responseName:sourceField` form inside `fields`.
- `sort` is sent in the Monospace object form (`sort[0][title][direction]=asc`). Field names (`'title'`, `'-title'` for descending) and the `{ title: 'desc' }` shorthand are normalized to it.

::: tip
Monospace limits list responses to 100 items by default (`MONOSPACE_QUERY_LIMIT_DEFAULT`). Pass an explicit `limit` when you expect more items.
:::

## Cached Queries

Queries served from the rstore cache re-apply Monospace `filter`, `sort`, `limit`, and `offset` options locally, so repeated queries stay consistent with what Monospace would return. Options that cannot be evaluated locally — relational filters, `_some`/`_every`/`_none` quantifiers, aliased `fields`, raw includes with aliases, `filter`, a finite `limit`, or `offset` (see [Relations](#relations)), and sort `nulls` placement — automatically fall back to a fetch.

rstore function filters (`filter: item => ...`) only filter the cache and are never sent to Monospace.

## Relations

Relations are detected from the Monospace OpenAPI document — to-one relation fields (`$ref` schemas, optionally nullable) and to-many relation fields (`{ data: [...] }` envelope schemas) that point to another exposed collection — and joined on the **real foreign key columns** resolved from the schema metadata FK constraints. For example, `Todos.author` backed by the `author_id -> Profiles.id` constraint becomes a relation with `on: { id: 'author_id' }`, and the backward `Profiles.todos` becomes `many: true, on: { author_id: 'id' }` (relations may also join through non-primary-key unique columns, matching the constraint). The generated item interfaces type relation fields with the generated interfaces (`author?: Profiles | null`, `todos?: Todos[]`), and the FK columns themselves are plain typed fields (`author_id?: string | null`).

The `include` find option maps to the Monospace [`include` query parameter](https://docs.monospace.io/en/developer/api/field-selection): included relations are embedded in the same request (for example `fields=*&include[author][fields]=*`), so no extra round trip is needed. Related items are written to the rstore cache and resolved through the wrapped item relation accessors:

```vue
<script lang="ts" setup>
const store = useStore()

const { data: todos } = await store.Todos.query(q => q.many({
  include: {
    author: true,
  },
}))

// `author` resolves the related Profiles item from the cache.
const authors = computed(() => todos.value.map(todo => todo.author?.name))
</script>
```

Nested relations can be included recursively with `include: { author: { include: { todos: true } } }` (`include[author][include][todos][fields]=*`). Each included relation selects every field, and to-many relations are requested with `limit: -1`, because Monospace otherwise embeds at most 100 related items per parent and the truncated lists would be cached.

Raw Monospace include options can be passed through `params.include`. They are merged into the generated include, your values winning — for example to narrow fields or to filter, sort, and paginate a to-many relation:

```ts
const { data: profiles } = await store.Profiles.query(q => q.many({
  include: { todos: true },
  params: {
    include: {
      todos: {
        filter: { completed: { _eq: false } },
        sort: [{ created_at: { direction: 'desc' } }],
        limit: 5,
      },
    },
  },
}))
```

Monospace accepts `filter`, `sort`, `limit`, and `offset` on to-many includes, only `filter` on nullable to-one includes, and none of them on required to-one includes. The cache resolves relation accessors through FK joins on every cached related item, so it cannot reproduce a filtered or paginated include: such queries always fetch.

A few notes on how the adapter maps Monospace responses to the rstore cache:

- To-many `{ data: [...] }` envelopes are unwrapped to plain arrays before items reach rstore, which is why generated to-many fields are typed `Todos[]`.
- Relation accessors join on the real FK columns (for example `Todos.author_id`), which the API returns like any other column. When you pass an explicit `fields` list together with `include`, the adapter automatically appends the FK columns backing the included relations so the cache join always resolves; wildcard (`*`) selections already contain them. Narrowed include `fields` likewise get the related items' join and primary key columns.
- When a query with `include` is served from the cache, the plugin issues one follow-up request to re-fetch items whose relations cannot be resolved locally. A to-one relation resolvable from the cache — a `null` FK column, or a non-null FK column whose target item is already cached — is not re-fetched. To-many relations cannot distinguish "not loaded" from "no related items", so cache-served results always re-fetch them.
- Relation fields pointing to schemas that are not exposed collections (missing from `x-monospace-mappings`) stay typed as `any` and do not become relations.

### Relational writes

Form [relation methods](/guide/data/form#relation-methods) (`$connect`, `$disconnect`, `$set`) are serialized into mutation body writes when the form is submitted:

```ts
const form = store.Todos.createForm()
form.title = 'A'
form.author.$connect({ id: 'p1' })
await form.$submit()
// POST /api/{workspace}/items/Todos?fields=*
// [{ "title": "A", "author": { "_connect": { "key": { "id": "p1" } } } }]
```

- To-one `$connect(item)` on **create** becomes a single `{ _connect: { key } }` object keyed by the constraint's referenced columns (above), because Monospace create inputs do not accept FK columns. On **update** it writes the relation's real FK columns (`{ "author_id": "p1" }`), which update inputs accept. Referenced column values missing from the connected item (for example connecting an email-joined relation by `id` only) are resolved from the rstore cache; when they cannot be resolved the mutation fails with an error naming the missing columns.
- To-one `$disconnect()` writes `null` to the FK columns on update and omits the relation on create.
- FK columns set directly on a create body (`store.Todos.create({ title: 'A', author_id: 'p1' })`, also with `createMany`) are translated into the same `_connect` operation; `null` FK columns are omitted.
- A to-one relation on the backward side of a one-to-one relation (the FK lives on the target, as declared by the generated relation meta `forward: false`) has no FK columns to write: `$connect` becomes `_connect` (a single object on create, `[{ _connect: { key } }]` on update) and `$disconnect()` becomes `[{ _disconnect: {} }]` on update.
- Generated collections carry the relation direction from the schema metadata, so a one-to-one relation whose FK columns are also the whole primary key of the mutated collection is still written as a forward relation. Hand-written collections without that meta treat a to-one relation joining on exactly the mutated collection primary key columns as backward.
- To-many `$connect(item)` becomes a `_connect: { keys: [{ ... }] }` [relational write operation](https://docs.monospace.io/en/developer/api/relational-data) — there are no columns on the parent side to write. The accepted key columns are derived from the OpenAPI `...ConnectBackwardKeysInput` schemas (any unique column subset of the target), with missing columns resolved from the rstore cache when possible.
- To-many `$disconnect(item)` becomes `_disconnect` with a primary key filter and `$disconnect()` without arguments disconnects all related items with `_disconnect: {}`. `$set(items)` is decomposed into `_connect` for newly added items and `_disconnect` for removed ones, relative to the related items currently in the rstore cache.
- To-many relation fields carry an array of operations in both create and update requests, matching the shapes accepted by the Monospace API. To-many disconnect operations are dropped on create — a new item has nothing to disconnect and Monospace create bodies only accept `_create`/`_connect`.

Monospace operation payloads assigned directly to a relation field (for example `form.author = [{ _connect: { key: { id: 'p1' } } }]`, or nested `_create`/`_update` payloads) are sent to the API untouched.

After a successful mutation the cache stays consistent without a refetch: to-one FK columns come back on the mutation response (requested with `fields=*`) like any other column, and for to-many operations the plugin patches the real FK columns on the affected target items in the cache (pointing them at the mutated parent on connect, `null` on disconnect). When a to-many connected item is known only by non-primary-key connect columns and cannot be resolved from the cache, the cache patch is skipped instead of writing a broken stub.

A few limitations to keep in mind:

- Hand-written collections without generated connect key metadata fall back to primary key connect keys for to-many operations, which only works for relations joining on the target primary key.
- `$set` decomposition and cache reconciliation resolve "currently related" items from the rstore cache, so related items that were never loaded are not disconnected by `$set`. Use `$disconnect()` without arguments to disconnect everything server-side.
- Form relation methods never produce inline `_create` operations; assign the payload directly to the relation field to create related items in the same request.

## Mutations

- Create and update requests send `fields=*`: Monospace only returns the written items when `fields` is set, and rstore needs them to update its cache.
- Composite primary keys cannot go in the URL path, so updates and deletes of composite-key items use filtered collection requests, for example `PATCH /api/{workspace}/items/OrderLines?filter[order_id][_eq]=1&filter[line][_eq]=2`. The key column values are read from the cached item, then from the mutated item, then by splitting the generated `a::b` rstore key in primary key order. `deleteMany` sends one `DELETE` request with an `_in` filter (single primary key) or an `_or` filter over the key columns (composite primary key).
- Collections whose generated metadata has `meta.monospace.itemRoutes: false` (no `/{key}` item routes) use the same filtered requests.
- The REST client also accepts object keys directly: `monospace.readOne('OrderLines', { order_id: 1, line: 2 })` reads through `?filter[...]&limit=1` and resolves to `null` when no item matches.

Monospace caches read responses server-side for a few minutes. Set the `cacheControl: 'no-cache'` module option (or pass it to `createMonospaceRestClient`, or to `createMonospaceRstorePlugin` when it creates the client) to send `Cache-Control: no-cache` and bypass that cache.

## Generated Schema

At Nuxt build time, the module loads the Monospace OpenAPI document and the schema metadata (remotely or from local JSON files). It generates rstore collections with:

- `getKey` functions derived from the true primary keys — the ordered columns of each collection's primary index, including composite and non-`id` keys
- TypeScript item interfaces from `*CollectionOutput` schemas (64-bit integers are typed `string`, since Monospace returns them as decimal strings)
- rstore relations joining on the real FK constraint columns
- Monospace collection metadata used by the REST plugin, under `meta.monospace`: `itemRoutes: false` for collections without `/{key}` item routes (no single-column primary key), `operations` for collections serving only some operations (for example read-only extension connector collections), and `int64Fields` listing the 64-bit integer fields

The `primaryKeys` option is an override only. A collection with no primary index in the metadata and no override fails generation with an explicit error, since rstore could not compute stable item keys for it:

```ts
export default defineNuxtConfig({
  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    workspace: 'your-workspace',
    primaryKeys: {
      // Override the primary index columns of a collection.
      Articles: 'slug',
    },
  },
})
```

The runtime plugin calls Monospace REST endpoints directly:

- `GET /api/{workspace}/items/{collection}`
- `GET /api/{workspace}/items/{collection}/{id}`
- `POST /api/{workspace}/items/{collection}`
- `PATCH /api/{workspace}/items/{collection}/{id}`
- `PATCH /api/{workspace}/items/{collection}` (filtered: composite keys, collections without item routes)
- `DELETE /api/{workspace}/items/{collection}/{id}`
- `DELETE /api/{workspace}/items/{collection}` (filtered: `deleteMany`, composite keys, collections without item routes)

OpenAPI generation uses the Monospace schema endpoint documented in the [OpenAPI spec reference](https://docs.monospace.io/en/reference/api-reference/openapi-spec); schema metadata generation reads the schema structure endpoint with explicit field selections and `limit=-1` (unlimited) on every to-many include. Runtime CRUD follows the [Monospace API overview](https://docs.monospace.io/en/developer/api/overview).

## Limitations

- Monospace does not support aggregations (`aggregate`, `groupBy` are silently ignored by the API) and does not document a realtime API, so neither is available through this module.
- Relation fields referencing schemas that are not exposed collections are typed as `any` and are not generated as rstore relations. Metadata relations whose field is not exposed in the OpenAPI document are ignored.
- Generation fails with explicit errors when the OpenAPI document and the schema metadata disagree (a collection or relation field missing from the metadata, mismatched relation targets) — regenerate the metadata snapshot when the workspace schema changes.
