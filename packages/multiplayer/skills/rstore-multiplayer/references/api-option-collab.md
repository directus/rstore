| name | description |
| --- | --- |
| `api-option-collab` | Reference for the `rstoreMultiplayerServer.collab` option |

# rstoreMultiplayerServer.collab

Serve collab documents on the multiplayer endpoint. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`collab: true | { maxMessageBytes?, rateLimit? }` in `rstoreMultiplayerServer` (default `false`).

## Syntax

```ts
export default defineNuxtConfig({ rstoreMultiplayerServer: { collab: true } })
```

## Behavior

- `collab:*` frames go to the sequencer configured by `defineRstoreCollab()`; other frames reach the rooms.
- Limits of `collab:*` frames: `maxMessageBytes` 1 MiB and `rateLimit` `{ capacity: 120, refillPerSecond: 60 }` by default.
- Adds the `defineRstoreCollab` and `useRstoreCollabServer` server auto-imports and sets `runtimeConfig.public.rstoreMultiplayerEndpoint`.

## Requirements

- `@rstore/nuxt-multiplayer-server`.

## Pitfalls

1. Without `defineRstoreCollab({ store })`, documents live in memory.
