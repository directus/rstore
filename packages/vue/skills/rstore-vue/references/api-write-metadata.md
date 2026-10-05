| name | description |
| --- | --- |
| `api-write-metadata` | Reference for the `metadata` option of cache writes, cache deletes and mutations |

# Write metadata (`metadata`)

Opaque per-write data forwarded by the cache to plugin hooks.

## Surface

`metadata` option accepted by `store.$cache.writeItem`, each item of `store.$cache.writeItems`, `store.$cache.deleteItem` and collection mutations.

## Syntax

```ts
store.$cache.writeItem({ collection, key, item, metadata: { fieldTimestamps } })
store.$cache.writeItems({ collection, items: [{ key, value, metadata: { fieldTimestamps } }] })
store.$cache.deleteItem({ collection, key, metadata: { deletedAt } })
await store.todos.update(item, { metadata: { fieldTimestamps } })
```

## Behavior

- The cache never reads `metadata`; it forwards it to the `cacheBeforeWriteItem` and `cacheBeforeDeleteItem` hooks.
- Mutation hook payloads (`createItem`, `updateItem`, `deleteItem`) expose it read-only as `payload.metadata`.
- Plugins give keys a meaning, for example `fieldTimestamps` / `deletedAt` merged by the multiplayer plugin (see the `rstore-multiplayer` skill).
- In development, the cache warns once per key when no hook handled a metadata key (handlers mark keys with `consume()`).
- The offline plugin keeps metadata on queued mutations and replays them with it.

## Requirements

- Declare custom keys by augmenting `CustomCacheWriteMetadata` from `@rstore/shared`.
- A plugin must handle each key; otherwise the write is a plain write.

## Pitfalls

1. The development warning about unhandled `fieldTimestamps`/`deletedAt` usually means the multiplayer plugin is missing: stamped writes then overwrite the cached row.
2. Do not pass `fieldTimestamps` / `deletedAt` as top-level options; they belong under `metadata` since v0.9.
