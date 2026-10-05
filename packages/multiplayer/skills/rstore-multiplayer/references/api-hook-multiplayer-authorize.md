| name | description |
| --- | --- |
| `api-hook-multiplayer-authorize` | Reference for the `multiplayer.authorize` server hook |

# multiplayer.authorize

Authorizes a peer joining a room and binds its verified identity.

## Surface

`hooks.hook('multiplayer.authorize', ({ peer, roomId, reject, setUserId }) => …)`.

## Syntax

```ts
rstoreMultiplayerServerHooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => {
  // Your own session lookup from the upgrade request (cookies, token…)
  const user = await getUserFromRequest(peer.request)
  if (!user || !canAccess(user, roomId))
    return reject()
  setUserId(user.id)
})
```

## Behavior

- Runs once per connection and room.
- `reject()` (or a throwing handler) drops the frame and keeps the peer out of the room.
- `setUserId()` binds a verified user id to the connection; otherwise the first user id the client sends is bound.
- Every later frame is rewritten with the bound user and client ids.

## Requirements

- Register it in production: without any handler, the server warns once at the first connection.

## Pitfalls

1. Skipping `setUserId()` trusts the client-sent user id for the binding.
