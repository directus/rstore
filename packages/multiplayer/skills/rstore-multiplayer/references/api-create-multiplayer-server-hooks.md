| name | description |
| --- | --- |
| `api-create-multiplayer-server-hooks` | Reference for `createMultiplayerServerHooks()` |

# createMultiplayerServerHooks

Creates the hook bus consumed by `createMultiplayerServer`.

## Surface

`createMultiplayerServerHooks()` from `@rstore/multiplayer/server`.

## Syntax

```ts
const hooks = createMultiplayerServerHooks()
hooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => { /* ... */ })
hooks.hook('multiplayer.filter', ({ message, reject }) => { /* ... */ })
```

## Behavior

- Exposes `hook(name, handler)` for `multiplayer.authorize` and `multiplayer.filter`.

## Requirements

- Pass it as `hooks` to `createMultiplayerServer`.

## Pitfalls

1. In Nuxt, use the `rstoreMultiplayerServerHooks` auto-import instead of creating a second bus.
