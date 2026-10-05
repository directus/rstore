| name | description |
| --- | --- |
| `api-hook-multiplayer-filter` | Reference for the `multiplayer.filter` server hook |

# multiplayer.filter

Per-frame filter before broadcast.

## Surface

`hooks.hook('multiplayer.filter', ({ message, reject }) => …)`.

## Syntax

```ts
rstoreMultiplayerServerHooks.hook('multiplayer.filter', ({ message, reject }) => {
  if (message.type === 'multiplayer:update' && 'role' in message.data)
    reject()
})
```

## Behavior

- Runs on every frame after identity binding; `reject()` stops its broadcast.

## Requirements

- Use it for content rules; use `multiplayer.authorize` for room access.

## Pitfalls

1. It does not run for frames already dropped by size limit, rate limit, validation or authorization.
