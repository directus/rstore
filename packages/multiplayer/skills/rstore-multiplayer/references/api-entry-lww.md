| name | description |
| --- | --- |
| `api-entry-lww` | Reference for the `@rstore/multiplayer/lww` entry |

# @rstore/multiplayer/lww

Field merge, tombstones and conflict policies as plain functions, usable without a store.

## Surface

Subpath `@rstore/multiplayer/lww`: `mergeItemFields`, `createFieldTimestamps`, `maxStamp`, `applyConflictPolicy`.

## Syntax

```ts
import { applyConflictPolicy, createFieldTimestamps, maxStamp, mergeItemFields } from '@rstore/multiplayer/lww'
```

## Behavior

- Exposes the field merge, stamp and conflict policy building blocks of the plugin as plain functions.
- Former LWW and tombstone helpers of `@rstore/core` moved here in v0.9.

## Requirements

- For store caches, prefer `createMultiplayerPlugin()`.

## Pitfalls

1. Importing LWW/tombstone helpers from `@rstore/core` is the pre-0.9 path (removed in 0.10).
