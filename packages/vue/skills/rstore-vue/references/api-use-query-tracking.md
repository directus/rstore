| name | description |
| --- | --- |
| `api-use-query-tracking` | Reference for `useQueryTracking({ store, cached, result })` |

# useQueryTracking

## Surface

Tracks query item membership and filters out stale dirty items from cached results.

## Syntax

```ts
const tracking = useQueryTracking({
  store,
  cached,
  result,
})
```

## Behavior

- Assigns a tracking query id and updates item `$meta.queries` / `$meta.dirtyQueries`.
- Returns `filteredCached`, `handleQueryTracking`, and helper methods.
- Marks previously tracked items as dirty when query membership changes.

## Requirements

- Requires a valid `VueStore` instance and wrapped cached items.

## Pitfalls

1. Skipping cleanup can leave items marked dirty until scope disposal or next tracking update.
