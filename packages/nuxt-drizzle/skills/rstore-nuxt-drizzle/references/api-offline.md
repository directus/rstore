| name | description |
| --- | --- |
| `api-offline` | Reference for `rstoreDrizzle.offline` |

# rstoreDrizzle.offline

## Surface

Enables offline plugin generation and synchronization bridge.

## Syntax

```ts
rstoreDrizzle: {
  offline: true,
}
```

## Behavior

- Creates a build-time offline plugin template with provided options.
- Adds generated offline plugin and `plugin-offline` runtime bridge.
- Sync hook compares local keys and fetches updates by `updatedAt`.
- The offline plugin persists item metadata namespaces registered with `persist: true` (multiplayer field stamps and tombstones from `ws`) and restores them on first sync, before queued mutations replay.
- Queued mutations keep their write `metadata` and replay with it.

## Requirements

- Generated collections need stable keys and meaningful `updatedAt`.

## Pitfalls

1. Enabling offline on collections without update timestamps degrades sync quality.
