# Nuxt Multiplayer Server <Badge text="New in v0.9" /> <Badge text="Experimental" type="warning" />

`@rstore/nuxt-multiplayer-server` mounts a WebSocket endpoint that relays the frames of [`@rstore/nuxt-multiplayer`](./nuxt-multiplayer.md) between the members of each room. It is a Nitro adapter over `createMultiplayerServer` from [`@rstore/multiplayer/server`](../guide/data/collaboration.md#server).

## Setup

```sh
pnpm i @rstore/nuxt-multiplayer-server
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-multiplayer-server'],
  rstoreMultiplayerServer: {
    endpoint: '/api/rstore-multiplayer/ws',
  },
})
```

The module enables Nitro's experimental WebSocket support.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | `'/api/rstore-multiplayer/ws'` | Route of the WebSocket handler |
| `maxRoomSize` | `100` | Peers per room; further joins are dropped |
| `maxMessageBytes` | `16384` | Larger frames are dropped (the connection stays open) |
| `rateLimit` | `{ capacity: 60, refillPerSecond: 30 }` | Per-peer token bucket; `false` disables it |
| `allowedOrigins` | same origin only | Extra origins accepted at upgrade, or `false` to disable the check. Browsers do not apply CORS to WebSocket handshakes, so this blocks cross-site WebSocket hijacking |
| `collab` | `false` | Serve [collab documents](#collab-documents) on the same endpoint. `true`, or `{ maxMessageBytes, rateLimit }` for `collab:*` frames (defaults: `1048576` and `{ capacity: 120, refillPerSecond: 60 }`) |

## Hooks

Register handlers in a Nitro plugin with the `rstoreMultiplayerServerHooks` auto-import:

```ts
// server/plugins/multiplayer.ts
export default defineNitroPlugin(() => {
  rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => {
    // Your own session lookup from the upgrade request (cookies, token…)
    const user = await getUserFromRequest(peer.request)
    if (!user || !canAccess(user, roomId))
      return reject()
    setUserId(user.id)
  })

  rstoreMultiplayerServerHooks.hook('multiplayer.filter', ({ message, reject }) => {
    if (message.type === 'multiplayer:update' && 'role' in message.data)
      reject()
  })
})
```

- `multiplayer.authorize` runs once per connection and room. `reject()` (or a throwing handler) drops the frame and keeps the peer out of the room. Without any handler, the server warns once, at the first connection: anyone who can reach the endpoint may join any room.
- **Identity.** `setUserId()` binds a verified user id to the connection. Otherwise the first user id the client sends is bound. Either way, every later frame is rewritten with the bound user and client ids, so a peer cannot impersonate someone else or remove their presence.
- `multiplayer.filter` runs on every frame after identity binding; `reject()` stops its broadcast.
- When a connection closes, the other members of its rooms receive a `multiplayer:leave` frame.

`Room`, `RoomRegistry`, `PeerIdentityStore`, `PeerRateLimiter` and `isOriginAllowed` are re-exported from `@rstore/multiplayer/server` for compatibility.

## Collab documents <Badge text="Experimental" type="warning" />

With `collab: true`, `collab:*` frames of the endpoint go to the [collab document sequencer](../guide/data/collaborative-documents.md#server); other frames still reach the rooms. Configure it in a Nitro plugin with the `defineRstoreCollab` auto-import, before clients connect:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-multiplayer-server'],
  rstoreMultiplayerServer: { collab: true },
})
```

```ts
// server/plugins/collab.ts
import { createDrizzleOpLogStore } from '@rstore/nuxt-drizzle/collab'

export default defineNitroPlugin(() => {
  defineRstoreCollab({
    store: createDrizzleOpLogStore({ db: useDrizzle(), tables: { nodes: docNodes, ops: collabOps, docs: collabDocs } }),
    hooks: {
      // `peer.ws` is the crossws peer, with the upgrade request.
      authorize: async ({ peer, docId }) => {
        const user = await getUserFromRequest(peer.ws.request)
        return user && canEdit(user, docId) ? { userId: user.id } : false
      },
    },
  })
})
```

- Without `store`, documents live in memory: they are lost on restart and only one server process may serve them.
- `useRstoreCollabServer()` returns the sequencer, for server-authored edits from API routes or jobs: `await useRstoreCollabServer().submitServer(docId, ops)`.
- One process must sequence a given document: with several instances, route each document to one of them (sticky sessions on the document id).
- The module exposes the endpoint as `runtimeConfig.public.rstoreMultiplayerEndpoint`, the default of `useRstoreCollabDocument()`.
