| name | description |
| --- | --- |
| `api-presence-notify-typing` | Reference for presence channel `notifyTyping(target)` |

# channel.notifyTyping

Sends a typing indicator for a record or field.

## Surface

`channel.notifyTyping({ collection, key, field? })`.

## Syntax

```ts
channel.notifyTyping({ collection: 'documents', key: 42, field: 'body' })
```

## Behavior

- Sends a `multiplayer:typing` frame with a record target only, never the typed content.
- Throttled per target by `typingThrottleMs` (default `1000`).
- Remote indicators expire `typingTimeoutMs` (default `3000`) after their last frame.
- Current typers are exposed as `typing` in `channel.subscribe` snapshots.

## Requirements

- Call it on input events.

## Pitfalls

1. Putting content or extra keys in the target is rejected by the protocol guard.
