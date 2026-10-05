| name | description |
| --- | --- |
| `api-cache-conflict` | Reference for the `cacheConflict` plugin hook |

# cacheConflict

Hook called for LWW conflicts left unresolved by the conflict policy.

## Surface

`hook('cacheConflict', payload => void)` inside `definePlugin({ setup })`; declared by `@rstore/multiplayer`.

## Syntax

```ts
hook('cacheConflict', (payload) => {
  console.log(
    payload.collection.name,
    payload.key,
    payload.conflicts, // Array<{ field, localValue, remoteValue, localTimestamp, remoteTimestamp }>
  )
})
```

## Behavior

- Called by the multiplayer plugin when `conflictPolicy` is `'lww'` (default) or the policy function returns `undefined`.
- Typical uses: conflict telemetry, custom resolution workflows, collaboration warnings in the UI.

## Requirements

- `@rstore/multiplayer` installed: the hook only type-checks then.

## Pitfalls

1. Not called without `createMultiplayerPlugin()`; the core cache has no merge policy since v0.9.
2. Not related to form `$conflicts` (`FormFieldConflict`), which come from `$rebase`.
