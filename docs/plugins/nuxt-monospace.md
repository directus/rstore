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
    project: 'your-project',
    schemaApiKey: process.env.MONOSPACE_API_KEY,
    scopeId: 'rstore-monospace',
  },
})
```

At build time, the module loads **both** the OpenAPI document (`GET /api/{project}/openapi`) and the Monospace system schema metadata, read through the regular items API (`GET /api/{project}/items/MonospaceCollection`, `MonospacePrimitiveField`, `MonospaceSingleRelationField`, `MonospaceSingleConstraintField`, `MonospaceIndex`, `MonospaceIndexField`). The metadata provides the true primary keys (primary indexes) and the real foreign key columns backing relations, so both sources are required for generation.

::: warning
Keep `schemaApiKey` server-side. It is used by the Nuxt module during build-time schema loading and is not emitted in generated runtime modules. The key needs the `openApiSchema:read` entitlement (OpenAPI document) and the `dataModel:read` entitlement (schema metadata collections). `runtimeApiKey` is emitted into client code if configured, so only use it for public/client-safe credentials.
:::

You can use local files instead of fetching the schema. Offline generation needs both the OpenAPI document (`input`) and a schema metadata snapshot (`metadataInput`):

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-monospace',
  ],

  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    project: 'your-project',
    input: './openapi.json',
    metadataInput: './schema-metadata.json',
  },
})
```

The metadata snapshot is a JSON object keyed by meta collection name, holding the raw item arrays exactly as returned by the items API — you can produce it with six `GET /api/{project}/items/{name}?limit=0` requests:

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

When only one of `input` / `metadataInput` is provided, the other source is loaded remotely (which then requires `url` and `project`).

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

The `fields`, `filter`, `sort`, `limit`, `offset`, `deep`, and `alias` options are read from the top level of find options. Other Monospace query parameters can be passed through `params`.

::: tip
Monospace limits list responses to 100 items by default (`MONOSPACE_QUERY_LIMIT_DEFAULT`). Pass an explicit `limit` when you expect more items.
:::

## Cached Queries

Queries served from the rstore cache re-apply Monospace `filter`, `sort`, `limit`, and `offset` options locally, so repeated queries stay consistent with what Monospace would return. Options that cannot be evaluated locally — relational filters, `_some`/`_every`/`_none` quantifiers, `deep`, `alias`, and sort `nulls` placement — automatically fall back to a fetch.

rstore function filters (`filter: item => ...`) only filter the cache and are never sent to Monospace.

## Relations

Relations are detected from the Monospace OpenAPI document — to-one relation fields (`$ref` schemas, optionally nullable) and to-many relation fields (`{ data: [...] }` envelope schemas) that point to another exposed collection — and joined on the **real foreign key columns** resolved from the schema metadata FK constraints. For example, `Todos.author` backed by the `author_id -> Profiles.id` constraint becomes a relation with `on: { id: 'author_id' }`, and the backward `Profiles.todos` becomes `many: true, on: { author_id: 'id' }` (relations may also join through non-primary-key unique columns, matching the constraint). The generated item interfaces type relation fields with the generated interfaces (`author?: Profiles | null`, `todos?: Todos[]`), and the FK columns themselves are plain typed fields (`author_id?: string | null`).

The `include` find option maps to Monospace [nested field selection](https://docs.monospace.io/en/developer/api/relational-data): included relations are embedded in the same request with `fields` dot notation (for example `fields=*,author.*`), so no extra round trip is needed. Related items are written to the rstore cache and resolved through the wrapped item relation accessors:

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

Nested relations can be included recursively with `include: { author: { include: { todos: true } } }`, and the top-level `deep` option constrains embedded to-many relations (`deep: { todos: { _limit: 5 } }`).

A few notes on how the adapter maps Monospace responses to the rstore cache:

- To-many `{ data: [...] }` envelopes are unwrapped to plain arrays before items reach rstore, which is why generated to-many fields are typed `Todos[]`.
- Relation accessors join on the real FK columns (for example `Todos.author_id`), which the API returns like any other column. When you pass an explicit `fields` list together with `include`, the adapter automatically appends the FK columns backing the included relations so the cache join always resolves; wildcard (`*`) selections already contain them.
- When a query with `include` is served from the cache, the plugin issues one follow-up request to re-fetch items whose relations cannot be resolved locally. A to-one relation resolvable from the cache — a `null` FK column, or a non-null FK column whose target item is already cached — is not re-fetched. To-many relations cannot distinguish "not loaded" from "no related items", so cache-served results always re-fetch them.
- Relation fields pointing to schemas that are not exposed collections (missing from `x-monospace-mappings`) stay typed as `any` and do not become relations.

### Relational writes

Form [relation methods](/guide/data/form#relation-methods) (`$connect`, `$disconnect`, `$set`) are serialized into mutation body writes when the form is submitted:

```ts
const form = store.Todos.createForm()
form.title = 'A'
form.author.$connect({ id: 'p1' })
await form.$submit()
// POST /api/{project}/items/Todos
// [{ "title": "A", "author_id": "p1" }]
```

- To-one `$connect(item)` writes the relation's real FK columns onto the body (`author_id` above) — the values of the constraint's referenced columns on the connected item. The FK column write is the canonical form: no `_connect` operation is emitted for to-one relations, since the Monospace engine accepts both and sending both would be redundant and ambiguous. Referenced column values missing from the connected item (for example connecting an email-joined relation by `id` only) are resolved from the rstore cache; when they cannot be resolved the mutation fails with an error naming the missing columns.
- To-one `$disconnect()` writes `null` to the FK columns, on create and update alike.
- To-many `$connect(item)` becomes a `_connect: { keys: [{ ... }] }` [relational write operation](https://docs.monospace.io/en/developer/api/relational-data) — there are no columns on the parent side to write. The accepted key columns are derived from the OpenAPI `...ConnectBackwardKeysInput` schemas (any unique column subset of the target), with missing columns resolved from the rstore cache when possible.
- To-many `$disconnect(item)` becomes `_disconnect` with a primary key filter and `$disconnect()` without arguments disconnects all related items with `_disconnect: {}`. `$set(items)` is decomposed into `_connect` for newly added items and `_disconnect` for removed ones, relative to the related items currently in the rstore cache.
- To-many create requests carry a single operation object per relation field while update requests carry an array of operations, matching the shapes accepted by the Monospace API. To-many disconnect operations are dropped on create — a new item has nothing to disconnect and Monospace create bodies only accept `_create`/`_connect`.

Monospace operation payloads assigned directly to a relation field (for example `form.author = [{ _connect: { key: { id: 'p1' } } }]`, or nested `_create`/`_update` payloads) are sent to the API untouched.

After a successful mutation the cache stays consistent without a refetch: to-one FK columns come back on the mutation response like any other column, and for to-many operations the plugin patches the real FK columns on the affected target items in the cache (pointing them at the mutated parent on connect, `null` on disconnect). When a to-many connected item is known only by non-primary-key connect columns and cannot be resolved from the cache, the cache patch is skipped instead of writing a broken stub.

A few limitations to keep in mind:

- Hand-written collections without generated connect key metadata fall back to primary key connect keys for to-many operations, which only works for relations joining on the target primary key.
- `$set` decomposition and cache reconciliation resolve "currently related" items from the rstore cache, so related items that were never loaded are not disconnected by `$set`. Use `$disconnect()` without arguments to disconnect everything server-side.
- Form relation methods never produce inline `_create` operations; assign the payload directly to the relation field to create related items in the same request.

## Generated Schema

At Nuxt build time, the module loads the Monospace OpenAPI document and the system schema metadata (remotely or from local JSON files). It generates rstore collections with:

- `getKey` functions derived from the true primary keys — the ordered columns of each collection's primary index, including composite and non-`id` keys
- TypeScript item interfaces from `*CollectionOutput` schemas
- rstore relations joining on the real FK constraint columns
- Monospace collection metadata used by the REST plugin

The `primaryKeys` option is an override only. A collection with no primary index in the metadata and no override fails generation with an explicit error, since rstore could not compute stable item keys for it:

```ts
export default defineNuxtConfig({
  rstoreMonospace: {
    url: 'https://your-monospace-instance.com',
    project: 'your-project',
    primaryKeys: {
      // Override the primary index columns of a collection.
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

OpenAPI generation uses the Monospace schema endpoint documented in the [OpenAPI spec reference](https://docs.monospace.io/en/reference/api-reference/openapi-spec); schema metadata generation reads the system schema meta collections through the items API with `limit=0` (unlimited). Runtime CRUD follows the [Monospace API overview](https://docs.monospace.io/en/developer/api/overview).

## Limitations

- Monospace does not support aggregations (`aggregate`, `groupBy` are silently ignored by the API) and does not document a realtime API, so neither is available through this module.
- Relation fields referencing schemas that are not exposed collections are typed as `any` and are not generated as rstore relations. Metadata relations whose field is not exposed in the OpenAPI document are ignored.
- Generation fails with explicit errors when the OpenAPI document and the schema metadata disagree (a collection or relation field missing from the metadata, mismatched relation targets) — regenerate the metadata snapshot when the project schema changes.
