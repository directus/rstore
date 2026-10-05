| name | description |
| --- | --- |
| `api-get-tombstone` | Reference for `getTombstone(store, collection, key)` |

# getTombstone

Reads the tombstone of a deleted row.

## Surface

`getTombstone(store, collectionName, key)` from `@rstore/multiplayer`.

## Syntax

```ts
import { getTombstone } from '@rstore/multiplayer'

getTombstone(store, 'todos', '2') // { collection, key, deletedAt }
```

## Behavior

- Returns `{ collection, key, deletedAt }` from `multiplayer:tombstone` item metadata.

## Requirements

- Store with `createMultiplayerPlugin()` installed.

## Pitfalls

1. Replaces `cache.tombstones` (deprecated in 0.9, removed in 0.10).
