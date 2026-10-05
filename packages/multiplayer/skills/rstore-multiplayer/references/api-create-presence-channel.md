| name | description |
| --- | --- |
| `api-create-presence-channel` | Reference for `createPresenceChannel(options)` |

# createPresenceChannel

Runs the presence protocol of one room over any text transport.

## Surface

`createPresenceChannel({ roomId, transport, user?, heartbeatMs?, staleMs?, typingTimeoutMs?, typingThrottleMs?, onInvalidMessage? })` from `@rstore/multiplayer/presence`.

## Syntax

```ts
import { createPresenceChannel } from '@rstore/multiplayer/presence'

const socket = new WebSocket(url)
const channel = createPresenceChannel({
  roomId: 'doc:42',
  user: { id: 'u1', name: 'Ada' },
  transport: {
    send: text => socket.send(text),
    isOpen: () => socket.readyState === WebSocket.OPEN,
  },
})
socket.addEventListener('message', event => channel.receive(event.data))
socket.addEventListener('open', () => channel.handleOpen())

channel.subscribe(({ peers, users, typing }) => render(peers, users, typing))
channel.onUpdate(update => applyRemoteFormState(update))
channel.dispose() // sends a leave frame and stops the timers
```

## Behavior

- Sends heartbeats (`heartbeatMs`, default `5000`) while the transport is open.
- Drops peers without frames for `staleMs` (default `15000`).
- Aggregates connections per user: `peers` has one entry per connection (`clientId`), `users` one per user (most recently seen connection). Two tabs of the same user see each other.
- Rebases carets over text changes.
- `user` is partial `{ id, name, color }`; missing parts are generated.
- `onInvalidMessage` is called with invalid frames from peers.
- Nothing is stored in the store cache.

## Requirements

- Feed every incoming message to `channel.receive(text)` and call `channel.handleOpen()` on transport open.
- The server must relay `multiplayer:*` frames between room members (`createMultiplayerServer`).
- In Nuxt, use the `@rstore/nuxt-multiplayer` composables instead.

## Pitfalls

1. Forgetting `dispose()` keeps heartbeat timers running and never sends the leave frame.
