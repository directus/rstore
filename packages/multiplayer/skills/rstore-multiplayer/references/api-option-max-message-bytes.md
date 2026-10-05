| name | description |
| --- | --- |
| `api-option-max-message-bytes` | Reference for the `maxMessageBytes` server option |

# maxMessageBytes

Maximum frame size.

## Surface

`maxMessageBytes: number` (default `16384`) on `rstoreMultiplayerServer` and `createMultiplayerServer`.

## Syntax

```ts
rstoreMultiplayerServer: { maxMessageBytes: 16_384 }
```

## Behavior

- Larger frames are dropped; the connection stays open.

## Requirements

- Applies to every incoming frame, including `multiplayer:update` form payloads.

## Pitfalls

1. Oversized `multiplayer:update` frames are lost without closing the socket.
