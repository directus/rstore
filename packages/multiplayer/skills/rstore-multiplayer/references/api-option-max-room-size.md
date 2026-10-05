| name | description |
| --- | --- |
| `api-option-max-room-size` | Reference for the `maxRoomSize` server option |

# maxRoomSize

Maximum peers per room.

## Surface

`maxRoomSize: number` (default `100`) on `rstoreMultiplayerServer` and `createMultiplayerServer`.

## Syntax

```ts
rstoreMultiplayerServer: { maxRoomSize: 100 }
```

## Behavior

- Further joins are dropped.

## Requirements

- Size it for the largest expected room.

## Pitfalls

1. Peers beyond the limit silently get no presence.
