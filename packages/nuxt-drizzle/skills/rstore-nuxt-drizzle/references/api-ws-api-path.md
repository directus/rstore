| name | description |
| --- | --- |
| `api-ws-api-path` | Reference for `rstoreDrizzle.ws.apiPath` |

# rstoreDrizzle.ws.apiPath

## Surface

Overrides the websocket endpoint path when `ws` is enabled in object form.

## Syntax

```ts
rstoreDrizzle: {
  ws: {
    apiPath: '/api/realtime/ws',
  },
}
```

## Behavior

- Defaults to `/api/rstore-realtime/ws`.
- Used by both server handler registration and client websocket plugin.

## Requirements

- Keep the same path exposed to client and server.

## Pitfalls

1. Proxy rewrite mismatches can make subscriptions appear idle with no updates.
