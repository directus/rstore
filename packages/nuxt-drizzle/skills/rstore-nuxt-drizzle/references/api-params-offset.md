| name | description |
| --- | --- |
| `api-params-offset` | Reference for `params.offset` |

# params.offset

## Surface

Shifts the starting row for server list queries.

## Syntax

```ts
await store.todos.findMany({
  params: {
    offset: 40,
    limit: 20,
  },
})
```

## Behavior

- Forwarded to server query builder as `q.offset`.
- Used directly or computed from `pageIndex * pageSize`.

## Requirements

- Combine with stable `orderBy` when paginating.

## Pitfalls

1. Offset pagination becomes inconsistent when sort order is not deterministic.
