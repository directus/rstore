# Batching <Badge text="New in v0.9" />

Batching collects multiple operations that happen in the same tick and dispatches them together through a dedicated set of plugin hooks. This lets a plugin combine them into a single network request — useful for GraphQL (one document with many operations), a bulk REST endpoint, or any API that accepts multiple entities per call.

Batching is opt-in, off by default.

## Enable batching

Pass `batching: true` (or an options object) to `createStore`:

```ts
const store = await createStore({
  schema,
  plugins,
  batching: true,
})
```

With custom options:

```ts
const store = await createStore({
  schema,
  plugins,
  batching: {
    fetch: true, // enable batching for fetch operations
    mutations: true, // enable batching for mutation operations
    delay: 0, // 0 = flush on the next microtask; otherwise ms
    maxWait: undefined, // hard cap from first enqueue; pairs with delay as debounce
    maxSize: Infinity, // flush immediately when this many ops are queued
  },
})
```

| Option | Default | Description |
|---|---|---|
| `fetch` | `true` | Batch `findFirst` calls (by key) from the same tick. |
| `mutations` | `true` | Batch `create` / `update` / `delete` from the same tick. |
| `delay` | `0` | `0` schedules a flush on the next microtask. Any positive number uses `setTimeout`. Without `maxWait`, this is the wait time from the **first** enqueue. With `maxWait` set, `delay` becomes a **debounce** — the timer resets on every new enqueue. |
| `maxWait` | `undefined` | Hard cap (ms) on how long a queued op can wait, measured from the first enqueue. Prevents starvation when `delay` is used as a debounce under sustained activity. Ignored when `delay` is `0`. |
| `maxSize` | `Infinity` | When this many operations are queued, the batch is flushed immediately instead of waiting for the next microtask / timeout. |

In a Nuxt app, set the same options under `rstore.store.batching` in `nuxt.config.ts`.

### Debounce vs delay-from-first

The same `delay` value means different things depending on whether `maxWait` is set:

```ts
createStore({
  // Delay from first enqueue: flushes ~50ms after the FIRST op of a batch.
  // Sustained activity still produces regular 50ms flushes.
  batching: { delay: 50 }
})
```

```ts
createStore({
  // Debounce with hard cap: the 50ms timer RESETS each enqueue, but the batch
  // is force-flushed after 200ms no matter what. Good for smoothing burstier
  // traffic without letting ops sit forever.
  batching: { delay: 50, maxWait: 200 }
})
```

## What can be batched

Only operations that carry enough information to reconcile results individually are eligible:

- `findFirst` **by key** — `store.todos.findFirst('abc')` or `findFirst({ key: 'abc' })`.
- Single-item mutations — `store.todos.create(...)`, `update(...)`, `delete(...)`.

The following are **not** batched and always run as their own operation:

- `findFirst` with a filter (no key), `findMany`, and their reactive `query` / `liveQuery` variants.
- `createMany` / `updateMany` / `deleteMany` — these already dispatch as bulk operations via their own `createMany` / `updateMany` / `deleteMany` hooks.

## Per-call control

The per-call `batch` option accepts three shapes:

```ts
// Opt out entirely — run on its own, not combined with other ops.
await store.todos.findFirst({ key: 'abc', batch: false })
await store.todos.create({ title: 'Go solo' }, { batch: false })

// Default behaviour — join the shared (`default`) batch group.
await store.todos.findFirst({ key: 'abc' }) // same as batch: true

// Explicit group — isolate this op into its own queue (see "Batch groups" below).
await store.todos.findFirst({ key: 'abc', batch: { group: 'tenantA' } })
await store.todos.create({ title: 'Tenant-scoped' }, { batch: { group: 'tenantA' } })
```

## Batch groups

Operations sharing the same **group** are queued and flushed together. Operations in different groups are never mixed — each group has its own queue, timers, and size limit.

This is useful whenever batched requests must not bleed into each other — for example:

- **Per-tenant batching.** One group per tenant keeps each batch request scoped to a single auth context.
- **Per-endpoint batching.** Group by endpoint when different calls need different headers or connection pools.
- **Priority lanes.** Put high-priority ops in their own group with a small `delay` and let background work debounce in another.

```ts
// In plugin hooks, the group name is available on the payload — use it to
// pick the right auth context, endpoint, or transport.
hook('batchFetch', async (payload) => {
  const items = await fetchForTenant(payload.group, payload.operations.map(op => op.key))
  // Match results back to each op by key — each op owns its own resolution.
  const byKey = new Map(items.map(item => [item.id, item]))
  for (const op of payload.operations) {
    op.setResult(byKey.get(op.key))
  }
})
```

If `group` is omitted, operations join the `default` group.

> Group names are opaque strings — use whatever naming convention fits your app.

## How it works

When batching is enabled, rstore collects eligible operations from the current tick into a queue. On flush, every operation is wrapped in a per-op handle with its own `setResult` / `setError`. The flush then walks through three tiers of hooks, with **each tier only seeing ops that weren't already resolved upstream**:

1. **`batch`** — a single hook receiving every fetch and mutation across every collection. Best for a protocol like GraphQL where fetches and mutations can live in the same request.
2. **`batchFetch` / `batchMutate`** — per-collection hooks. `batchFetch` is called once per collection. `batchMutate` is called once per `(collection, mutation type)` group.
3. **Individual hooks** — `fetchFirst` / `createItem` / `updateItem` / `deleteItem`. The normal non-batched hooks are used as a fallback for any op still unresolved after the batch tiers.

Because resolution is per-operation, a plugin can **selectively** resolve only the ops it owns (its own collection, its own auth context, etc.) and let everything else fall through automatically. Nothing needs to short-circuit the rest of the batch.

Each operation passed to a batch hook exposes:

| Property | Description |
|---|---|
| `type` | `'fetchFirst'` for fetches; `'create' \| 'update' \| 'delete'` for mutations. |
| `collection` | The resolved collection for this op. |
| `key` | Primary key (present on fetches, updates, deletes). |
| `item` | Partial input item (present on creates and updates). |
| `findOptions` | Resolved find options (fetch ops only). |
| `meta` | Per-op hook metadata. |
| `setResult(item, options?)` | Resolve this op with the returned item (or `undefined` if missing / delete). Fetch ops accept `{ marker }` in options. |
| `setError(error)` | Reject this op with an error. Siblings are unaffected. |
| `resolved` | `true` once `setResult` or `setError` has been called. |

### The unified `batch` hook

Use this when a single request can carry both fetches and mutations (e.g. GraphQL).

```ts
hook('batch', async (payload) => {
  const document = buildGraphQLDocument({
    fetches: payload.fetches,
    mutations: payload.mutations,
  })

  const response = await fetchGraphQL(document)

  // Resolve each op individually — parallel arrays are not required.
  payload.fetches.forEach((op, i) => {
    op.setResult(response.fetches[i])
  })
  payload.mutations.forEach((op, i) => {
    op.setResult(response.mutations[i])
  })
})
```

The payload exposes three arrays:

```ts
payload.operations // every op in the batch (fetches + mutations)
payload.fetches // fetch ops only
payload.mutations // mutation ops only
```

Ops the hook doesn't resolve fall through to `batchFetch` / `batchMutate`, then to the individual hooks. If nothing resolves an op, rstore rejects it with a descriptive error so callers never hang.

### Per-collection `batchFetch`

Called once per collection with every fetch op still unresolved after the unified `batch` hook.

```ts
hook('batchFetch', async (payload) => {
  if (payload.collection.name !== 'Todo')
    return

  const keys = payload.operations.map(op => op.key)
  const items = await api.get('/todos', { ids: keys })
  const byKey = new Map(items.map(item => [item.id, item]))

  // Resolve each op; order doesn't matter since results are routed per-op.
  for (const op of payload.operations) {
    op.setResult(byKey.get(op.key))
  }
})
```

### Per-collection `batchMutate`

Called once per `(collection, mutation type)` group with every unresolved mutation op.

```ts
hook('batchMutate', async (payload) => {
  if (payload.collection.name !== 'Todo')
    return

  if (payload.mutation === 'create') {
    const created = await api.post('/todos/bulk', payload.operations.map(op => op.item))
    payload.operations.forEach((op, i) => op.setResult(created[i]))
    return
  }

  if (payload.mutation === 'delete') {
    await api.delete('/todos/bulk', { ids: payload.operations.map(op => op.key) })
    for (const op of payload.operations) {
      op.setResult(undefined)
    }
  }
})
```

For delete operations, `setResult(undefined)` is enough to mark the op handled.

### Partial handling and fall-through

Because each op is resolved independently, a plugin can handle just the ops it owns and let the rest fall through. For example, a plugin that only supports its own tenant can short-circuit like this:

```ts
hook('batchFetch', async (payload) => {
  const mine = payload.operations.filter(op => op.findOptions.tenant === 'acme')
  if (mine.length === 0)
    return // let the next hook tier handle everything

  const items = await acmeApi.fetch(mine.map(op => op.key))
  const byKey = new Map(items.map(item => [item.id, item]))
  for (const op of mine) {
    op.setResult(byKey.get(op.key))
  }
  // Other ops remain unresolved and fall through to individual fetchFirst.
})
```

Errors are also per-op: `op.setError(err)` rejects just that op without affecting any siblings.

## Caveats

- **Query lifecycle hooks still run.** `beforeFetch` / `afterFetch` fire around a batched `findFirst`, and `beforeMutation` / `afterMutation` fire around batched mutations. Plugins that read query metadata or tracking info keep working.
- **`fetchPolicy: 'no-cache'` is respected.** Batched fetches that use `no-cache` do not write the result to the cache.
- **Optimistic updates still work.** Each batched mutation adds its own optimistic cache layer before enqueueing and rolls it back on error.
- **Mixing batching plugins.** Because resolution is per-op, a `batch` plugin that only handles GraphQL can coexist with a `batchFetch` plugin for REST endpoints — each just resolves the ops it owns and leaves the rest for the next hook tier.

## See also

- Plugin hooks reference — [`batch`](../plugin/hooks.md), [`batchFetch`](../plugin/hooks.md), [`batchMutate`](../plugin/hooks.md)
- [Fetch policies](./query.md#fetch-policy)
