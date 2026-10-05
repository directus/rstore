| name | description |
| --- | --- |
| `api-field-timestamps` | Reference for the `fieldTimestamps` write metadata key |

# metadata.fieldTimestamps

Per-field stamps carried by realtime writes and mutations.

## Surface

`metadata: { fieldTimestamps: Record<string, string | number> }` on `writeItem`, `writeItems` items and mutations.

## Syntax

```ts
store.$cache.writeItem({
  collection,
  key: frame.key,
  item: frame.record,
  metadata: { fieldTimestamps: frame.fieldTimestamps },
})

await store.todos.update(item, { metadata: { fieldTimestamps } })
```

## Behavior

- Maps field names to HLC strings (`physicalHex:logicalHex:nodeId`, from `@rstore/multiplayer/clock`) or numbers.
- For each field, the newest stamp wins; fields without a stamp are taken as they are.
- Writes without stamps (query results, local mutations) keep the stamps already stored for the row.
- Stored as item metadata `multiplayer:fields`.

## Requirements

- `createMultiplayerPlugin()` installed (LWW enabled for the collection).

## Pitfalls

1. Top-level `writeItem({ fieldTimestamps })` is the pre-0.9 form: still works in 0.9 with a development warning, removed in 0.10.
2. Without the plugin, the stamped write overwrites the whole cached row.
