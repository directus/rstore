| name | description |
| --- | --- |
| `api-params-limit` | Reference for `params.limit` |

# params.limit

## Surface

Limits result size for drizzle-backed list fetches.

## Syntax

```ts
await store.todos.findMany({
  params: {
    limit: 20,
  },
})
```

## Behavior

- Forwarded to server `findMany` query builder as `q.limit`.
- Can also be derived from `pageIndex/pageSize` in runtime fetch logic.

## Requirements

- Use with deterministic ordering for stable pagination.

## Pitfalls

1. Applying `limit` without `orderBy` can produce unstable page composition.
