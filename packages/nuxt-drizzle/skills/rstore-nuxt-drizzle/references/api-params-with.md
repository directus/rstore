| name | description |
| --- | --- |
| `api-params-with` | Reference for `params.with` |

# params.with

## Surface

Passes relational include shape to drizzle relational query builder.

## Syntax

```ts
await store.posts.findMany({
  params: {
    with: {
      author: true,
      comments: { limit: 5 },
    },
  },
})
```

## Behavior

- Forwarded to server query builder as `q.with`.
- Treated as opaque shape by this module and interpreted by Drizzle.

## Requirements

- Keys must match relations configured in the Drizzle schema.

## Pitfalls

1. Invalid relation names fail at query execution time.
