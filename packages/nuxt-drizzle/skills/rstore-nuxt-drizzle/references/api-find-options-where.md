| name | description |
| --- | --- |
| `api-find-options-where` | Reference for drizzle `findOptions.where` |

# findOptions.where

## Surface

Primary filter field for drizzle-backed reads (`findFirst`, `findMany`, `query`).

## Syntax

```ts
await store.todos.findMany({
  where: and(eq('status', 'open'), gte('updatedAt', new Date())),
})
```

## Behavior

- Sent to server through `SuperJSON` in fetch hooks.
- Applied in client cache filtering with `filterWhere`.
- Supports nested operators from drizzle condition helpers.

## Requirements

- Build conditions with supported helper shape (`eq`, `and`, `or`, `not`, etc.).

## Pitfalls

1. Invalid condition trees throw server-side `Invalid filter` errors.
