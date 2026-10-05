| name | description |
| --- | --- |
| `api-rstore-multiplayer-server-hooks` | Reference for the `rstoreMultiplayerServerHooks` Nitro auto-import |

# rstoreMultiplayerServerHooks

Hook bus of the Nuxt multiplayer server.

## Surface

`rstoreMultiplayerServerHooks.hook(name, handler)` in a Nitro plugin.

## Syntax

```ts
// server/plugins/multiplayer.ts
export default defineNitroPlugin(() => {
  rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => {
    const user = await getUserFromRequest(peer.request)
    if (!user || !canAccess(user, roomId))
      return reject()
    setUserId(user.id)
  })
})
```

## Behavior

- Accepts `multiplayer.authorize` and `multiplayer.filter` handlers.

## Requirements

- Register handlers in a Nitro plugin.

## Pitfalls

1. Without an authorize handler the server warns once and lets anyone join any room.
