| name | description |
| --- | --- |
| `api-deleted-at` | Reference for the `deletedAt` write metadata key |

# metadata.deletedAt

Delete stamp that records a tombstone.

## Surface

`metadata: { deletedAt: string | number }` on `deleteItem` and delete mutations.

## Syntax

```ts
store.$cache.deleteItem({
  collection,
  key: frame.key,
  metadata: { deletedAt: frame.deletedAt },
})
```

## Behavior

- Records a tombstone (item metadata `multiplayer:tombstone`, survives the row).
- A later write older than the tombstone is dropped, so a delayed frame cannot resurrect the row.
- A write newer than the tombstone recreates the row and clears the tombstone.

## Requirements

- `createMultiplayerPlugin()` installed (LWW enabled for the collection).

## Pitfalls

1. Top-level `deleteItem({ deletedAt })` is the pre-0.9 form: works in 0.9 with a development warning, removed in 0.10.
2. Without the plugin no tombstone is recorded and stale frames can resurrect deleted rows.
