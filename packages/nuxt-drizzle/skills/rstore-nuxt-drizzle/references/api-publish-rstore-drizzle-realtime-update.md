| name | description |
| --- | --- |
| `api-publish-rstore-drizzle-realtime-update` | Reference for `publishRstoreDrizzleRealtimeUpdate(update)` |

# publishRstoreDrizzleRealtimeUpdate

## Surface

Publishes a realtime update to current websocket subscribers, including updates created by direct server-side Drizzle writes.

## Syntax

```ts
publishRstoreDrizzleRealtimeUpdate({
  collection: tables.todos, // or 'todos'
  type: 'updated',
  record: todo,
  // key: todo.id, // optional for updated/deleted if inferable from primary keys
})
```

## Behavior

- Accepts a generated collection name or Drizzle table object.
- Supports `created`, `updated`, and `deleted` update types.
- For `updated` and `deleted`, infers the key from record primary keys when `key` is omitted.

## Requirements

- Realtime websocket support must be enabled with `rstoreDrizzle.ws`.

## Pitfalls

1. Missing primary key values on `record` require passing `key` explicitly.
