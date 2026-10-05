| name | description |
| --- | --- |
| `api-nuxt-multiplayer-server-module` | Reference for the `@rstore/nuxt-multiplayer-server` Nuxt module |

# @rstore/nuxt-multiplayer-server module

Nitro WebSocket endpoint relaying multiplayer frames between room members.

## Surface

`modules: ['@rstore/nuxt-multiplayer-server']` with `rstoreMultiplayerServer` options.

## Syntax

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-multiplayer-server'],
  rstoreMultiplayerServer: {
    endpoint: '/api/rstore-multiplayer/ws',
  },
})
```

## Behavior

- Nitro adapter over `createMultiplayerServer` from `@rstore/multiplayer/server`.
- Enables Nitro's experimental WebSocket support.
- Options: `endpoint`, `maxRoomSize`, `maxMessageBytes`, `rateLimit`, `allowedOrigins` (see their references).
- Module options and `rstoreMultiplayerServerHooks` are unchanged in v0.9.

## Requirements

- Deployment must support WebSockets.

## Pitfalls

1. Without a `multiplayer.authorize` handler, anyone who can reach the endpoint may join any room (warned once).
