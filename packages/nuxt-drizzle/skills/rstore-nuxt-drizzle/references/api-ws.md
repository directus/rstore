| name | description |
| --- | --- |
| `api-ws` | Reference for `rstoreDrizzle.ws` |

# rstoreDrizzle.ws

## Surface

Enables websocket realtime integration for generated drizzle collections.

## Syntax

```ts
rstoreDrizzle: {
  ws: true,
}
```

## Behavior

- Enables Nitro experimental websocket support.
- Registers realtime websocket server handler and publish hooks.
- Adds the realtime runtime plugin to store subscriptions.
- On reconnect, replays active subscriptions and triggers `realtimeReconnectEventHook` from `@rstore/vue` so `liveQuery` can refresh.
- Stamps every published frame with a Hybrid Logical Clock (`fieldTimestamps` on `created`/`updated`, `deletedAt` on `deleted`); the client writes them as cache `metadata`.
- Installs the `@rstore/multiplayer` LWW plugin by default (see `ws.lww`), so delayed frames never overwrite newer values or resurrect deleted rows.

## Requirements

- Deployment/runtime must support websocket connections.
- Set `RSTORE_DRIZZLE_NODE_ID` per server instance for a stable clock node id (otherwise random per process).

## Pitfalls

1. Turning this on without reachable websocket transport causes reconnect churn.
