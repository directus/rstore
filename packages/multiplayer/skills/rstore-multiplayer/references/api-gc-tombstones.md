| name | description |
| --- | --- |
| `api-gc-tombstones` | Reference for `gcTombstones(store, olderThan)` |

# gcTombstones

Removes tombstones older than a stamp.

## Surface

`gcTombstones(store, olderThanStamp)` from `@rstore/multiplayer`.

## Syntax

```ts
import { gcTombstones } from '@rstore/multiplayer'

gcTombstones(store, olderThanStamp)
```

## Behavior

- Removes tombstones whose `deletedAt` is older than the given stamp.

## Requirements

- Store with `createMultiplayerPlugin()` installed.

## Pitfalls

1. The plugin already runs periodic GC (`tombstoneGc`); call this only for manual control.
2. Removing a tombstone too early lets a delayed older frame resurrect the row.
