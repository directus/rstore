| name | description |
| --- | --- |
| `api-create-multiplayer-server` | Reference for `createMultiplayerServer(options)` |

# createMultiplayerServer

Transport-agnostic room server relaying `multiplayer:*` frames between room members.

## Surface

`createMultiplayerServer({ hooks, maxRoomSize?, maxMessageBytes?, rateLimit? })` from `@rstore/multiplayer/server`, with `handleMessage(peer, text)` and `handleClose(peerId)`.

## Syntax

```ts
import { createMultiplayerServer, createMultiplayerServerHooks } from '@rstore/multiplayer/server'

const hooks = createMultiplayerServerHooks()
const server = createMultiplayerServer({ hooks, maxRoomSize: 100, maxMessageBytes: 16_384, rateLimit: { capacity: 60, refillPerSecond: 30 } })

// In your WebSocket handler (`peer` needs `id` and `send(text)`):
server.handleMessage(peer, text)
server.handleClose(peer.id)
```

## Behavior

- Pipeline per frame: size limit, per-peer rate limit, validation, `multiplayer.authorize` (once per peer and room), identity binding, `multiplayer.filter`, broadcast to the other members.
- Once a connection is bound to a user, rewrites the user and client ids of its frames so a peer cannot speak for someone else.
- A closing peer leaves its rooms with a `multiplayer:leave` frame.
- `Room`, `RoomRegistry`, `PeerIdentityStore`, `PeerRateLimiter` are exported from the same entry.

## Requirements

- Works with any WebSocket runtime; `peer` needs `id` and `send(text)`.
- Check the upgrade `Origin` yourself with `isOriginAllowed`.
- In Nuxt, use `@rstore/nuxt-multiplayer-server`.

## Pitfalls

1. Without a `multiplayer.authorize` handler, anyone who reaches the endpoint may join any room.
