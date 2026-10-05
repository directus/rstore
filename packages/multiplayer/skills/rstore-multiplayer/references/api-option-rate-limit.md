| name | description |
| --- | --- |
| `api-option-rate-limit` | Reference for the `rateLimit` server option |

# rateLimit

Per-peer token bucket.

## Surface

`rateLimit: false | { capacity, refillPerSecond }` (default `{ capacity: 60, refillPerSecond: 30 }`) on `rstoreMultiplayerServer` and `createMultiplayerServer`.

## Syntax

```ts
rstoreMultiplayerServer: { rateLimit: { capacity: 60, refillPerSecond: 30 } }
```

## Behavior

- Frames over the limit are dropped.
- `false` disables it.

## Requirements

- Applies per peer, before validation and authorization.

## Pitfalls

1. Disabling it lets a single peer flood a room.
