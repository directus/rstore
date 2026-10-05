| name | description |
| --- | --- |
| `api-use-rstore-multiplayer-channel` | Reference for `useRstoreMultiplayerChannel(options)` |

# useRstoreMultiplayerChannel

Joins a multiplayer room from a Nuxt component.

## Surface

`useRstoreMultiplayerChannel<Data, Field>({ roomId, endpoint?, user?, heartbeatInterval?, stalePeerTimeout?, colors? })`.

## Syntax

```ts
const channel = useRstoreMultiplayerChannel<{ title?: string, body?: string }, 'title' | 'body'>({
  roomId: `doc:${props.id}`,
  user: { id: user.id, name: user.name },
})

onMounted(() => channel.joinRoom())
```

## Behavior

- Returns `user`, `clientId`, refs `peers` (one per connection), `presenceUsers` (one per user), `typingPeers`, `remoteUpdate`, `status`.
- Actions: `joinRoom`, `leaveRoom`, `sendUpdate`, `setFocusedField`, `setTextCursor`, `rebaseTextCursor`, `clearFocus`, `notifyTyping`, `stopTyping`.
- Leaves the room when the component (or effect scope) is unmounted.
- Defaults: `endpoint` = `runtimeConfig.public.wsEndpoint`, `heartbeatInterval` `5000`, `stalePeerTimeout` `15000`, `colors` built-in palette for generated users.

## Requirements

- Call `joinRoom()` (for example in `onMounted`).

## Pitfalls

1. Without a configured endpoint (`endpoint` or `runtimeConfig.public.wsEndpoint`) the channel has nowhere to connect.
