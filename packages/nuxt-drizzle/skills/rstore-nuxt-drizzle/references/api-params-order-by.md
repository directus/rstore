| name | description |
| --- | --- |
| `api-params-order-by` | Reference for `params.orderBy` |

# params.orderBy

## Surface

Sort specification for server and cache-side ordering.

## Syntax

```ts
await store.todos.findMany({
  params: {
    orderBy: ['updatedAt.desc', 'id.asc'],
  },
})
```

## Behavior

- Server parses `field.direction` (`asc` or `desc`) into drizzle order clauses.
- Cache filter hook applies equivalent sort to cached arrays.

## Requirements

- Each entry must be exactly `<field>.<asc|desc>`.

## Pitfalls

1. Invalid format throws a `400 Invalid orderBy` server error.
