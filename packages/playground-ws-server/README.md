# rstore playground WebSocket server

Generic pub/sub WebSocket server (Nitro, deployable as a Cloudflare Durable Object) used by the rstore playground: clients `subscribe`, `unsubscribe` and `publish` on topics.

It does not route `multiplayer:*` frames (no rooms, authorization or identity binding). For collaborative editing rooms, use [`@rstore/nuxt-multiplayer-server`](../nuxt-multiplayer-server) or `createMultiplayerServer` from `@rstore/multiplayer/server`.
