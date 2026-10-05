| name | description |
| --- | --- |
| `api-option-tombstone-gc` | Reference for `createMultiplayerPlugin({ tombstoneGc })` |

# tombstoneGc option

Periodic removal of old tombstones.

## Surface

`tombstoneGc: false | { intervalMs?, ttlMs? }` (default `{ intervalMs: 60_000, ttlMs: 86_400_000 }`).

## Syntax

```ts
createMultiplayerPlugin({ tombstoneGc: { intervalMs: 30_000 } })
createMultiplayerPlugin({ tombstoneGc: false })
```

## Behavior

- Runs on clients only.
- The timer stops when the cache is disposed.
- `false` disables it.

## Requirements

- Replaces the `createStore({ tombstoneGc })` option removed in v0.9.

## Pitfalls

1. Passing `tombstoneGc` to `createStore` no longer has effect; move it to the plugin.
