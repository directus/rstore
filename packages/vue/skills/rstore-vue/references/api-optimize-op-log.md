| name | description |
| --- | --- |
| `api-optimize-op-log` | Reference for `optimizeOpLog(operations, collection?)` |

# optimizeOpLog

## Surface

Optimizes form operation logs by removing redundant operations.

## Syntax

```ts
import { optimizeOpLog } from '@rstore/vue'

const optimized = optimizeOpLog(form.$opLog.getAll(), collection)
```

## Behavior

- Keeps only the last scalar `set` per field.
- Cancels relation `connect` / `disconnect` pairs when they neutralize each other.
- Preserves relation semantics for one-to-one and many relations.

## Requirements

- Pass `collection` when relation-aware optimization is required.

## Pitfalls

1. Optimizing without collection metadata can miss relation-specific reductions.
