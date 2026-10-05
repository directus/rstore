| name | description |
| --- | --- |
| `api-set-field-timestamps` | Reference for `setFieldTimestamps(store, collection, key, stamps)` |

# setFieldTimestamps

Replaces the stored per-field stamps of a row.

## Surface

`setFieldTimestamps(store, collectionName, key, fieldTimestamps)` from `@rstore/multiplayer`.

## Syntax

```ts
import { setFieldTimestamps } from '@rstore/multiplayer'

setFieldTimestamps(store, 'todos', '1', { title: stamp }) // replaces the stored stamps
```

## Behavior

- Replaces the `multiplayer:fields` item metadata of the row with the given stamps.

## Requirements

- Store with `createMultiplayerPlugin()` installed.

## Pitfalls

1. It replaces, not merges: fields missing from the object lose their stored stamp.
2. `cache.writeFieldTimestamps` is the pre-0.9 form (warns in development during 0.9, removed in 0.10).
