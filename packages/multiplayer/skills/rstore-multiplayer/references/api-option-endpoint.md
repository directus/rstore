| name | description |
| --- | --- |
| `api-option-endpoint` | Reference for `rstoreMultiplayerServer.endpoint` |

# rstoreMultiplayerServer.endpoint

Route of the WebSocket handler.

## Surface

`endpoint: string` (default `'/api/rstore-multiplayer/ws'`).

## Syntax

```ts
rstoreMultiplayerServer: {
  endpoint: '/api/rstore-multiplayer/ws',
}
```

## Behavior

- Mounts the relay handler at this route.

## Requirements

- Match `runtimeConfig.public.wsEndpoint` (or the `endpoint` option) of `@rstore/nuxt-multiplayer`.

## Pitfalls

1. A mismatch between server endpoint and client endpoint leaves clients unable to join rooms.
