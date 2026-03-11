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

## Requirements

- Deployment/runtime must support websocket connections.

## Pitfalls

1. Turning this on without reachable websocket transport causes reconnect churn.
