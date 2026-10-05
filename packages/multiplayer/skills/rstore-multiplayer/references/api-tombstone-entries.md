| name | description |
| --- | --- |
| `api-tombstone-entries` | Reference for `tombstoneEntries(store)` |

# tombstoneEntries

Iterates all tombstones of a store.

## Surface

`tombstoneEntries(store)` from `@rstore/multiplayer`.

## Syntax

```ts
import { tombstoneEntries } from '@rstore/multiplayer'

Array.from(tombstoneEntries(store))
```

## Behavior

- Returns an iterable of tombstones.

## Requirements

- Store with `createMultiplayerPlugin()` installed.

## Pitfalls

1. Replaces `cache.tombstones` (deprecated in 0.9, removed in 0.10).
