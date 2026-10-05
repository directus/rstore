| name | description |
| --- | --- |
| `api-get-field-timestamps` | Reference for `getFieldTimestamps(store, collection, key)` |

# getFieldTimestamps

Reads the stored per-field stamps of a row.

## Surface

`getFieldTimestamps(store, collectionName, key)` from `@rstore/multiplayer`.

## Syntax

```ts
import { getFieldTimestamps } from '@rstore/multiplayer'

getFieldTimestamps(store, 'todos', '1') // { title: '...', done: '...' }
```

## Behavior

- Returns the `multiplayer:fields` item metadata of the row.

## Requirements

- Store with `createMultiplayerPlugin()` installed.

## Pitfalls

1. Replaces `cache.readFieldTimestamps` (deprecated in 0.9, removed in 0.10).
