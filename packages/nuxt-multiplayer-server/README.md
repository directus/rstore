# @rstore/nuxt-multiplayer-server

Nitro WebSocket endpoint relaying the `multiplayer:*` frames of [`@rstore/nuxt-multiplayer`](https://rstore.akryum.dev/plugins/nuxt-multiplayer) between the members of each room. Experimental.

```sh
pnpm i @rstore/nuxt-multiplayer-server
```

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-multiplayer-server'],
  rstoreMultiplayerServer: {
    endpoint: '/api/rstore-multiplayer/ws',
    maxRoomSize: 100,
    rateLimit: { capacity: 60, refillPerSecond: 30 },
  },
})
```

```ts
// server/plugins/multiplayer.ts
export default defineNitroPlugin(() => {
  rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => {
    // Verify the session of `peer.request`, then:
    setUserId(userId)
  })
})
```

It is a thin adapter over `createMultiplayerServer` from [`@rstore/multiplayer/server`](https://rstore.akryum.dev/guide/data/collaboration#server): same-origin upgrades only by default, authorization once per room, identity binding against impersonation, size and rate limits, leave frames on disconnect.

With `collab: true`, the endpoint also sequences [collab documents](https://rstore.akryum.dev/guide/data/collaborative-documents) (experimental), configured with `defineRstoreCollab()` in a Nitro plugin.

Documentation: [Nuxt Multiplayer Server](https://rstore.akryum.dev/plugins/nuxt-multiplayer-server).

## License

MIT
