| name | description |
| --- | --- |
| `api-offline-serialize-date-value` | Reference for `rstoreDrizzle.offline.serializeDateValue` |

# rstoreDrizzle.offline.serializeDateValue

## Surface

Customizes the value used for `updatedAt >= lastUpdatedAt` sync filtering.

## Syntax

```ts
rstoreDrizzle: {
  offline: {
    serializeDateValue: date => date.toISOString(),
  },
}
```

## Behavior

- Serialized function is written into `$rstore-drizzle-config.js`.
- Runtime offline sync transforms `lastUpdatedAt` before building the `gte` filter.

## Requirements

- Function output must match the DB comparison shape for `updatedAt`.

## Pitfalls

1. Non-deterministic or timezone-misaligned serialization can miss updates.
