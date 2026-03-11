| name | description |
| --- | --- |
| `api-params-with` | Reference for `params.with` |

# params.with

## Surface

Low-level Drizzle relation config override for list/item reads.

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

- Forwarded directly to server query builder as `q.with`.
- Treated as opaque by this module and interpreted by Drizzle.
- Takes precedence over `findOptions.include` when both are provided.

## Requirements

- Keys must match relations configured in the Drizzle schema.

## Pitfalls

1. This bypasses include conversion guardrails; invalid relation shapes fail at Drizzle execution time.
