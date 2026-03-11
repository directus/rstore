| name | description |
| --- | --- |
| `api-find-options-include` | Reference for `findOptions.include` |

# findOptions.include

## Surface

Primary relation include option for Drizzle-backed reads (`findFirst`, `findMany`, `query`).

## Syntax

```ts
await store.users.findMany({
  include: {
    posts: {
      where: eq('published', true),
      orderBy: ['createdAt.desc'],
      limit: 5,
      columns: {
        id: true,
        title: true,
      },
      include: {
        comments: true,
      },
    },
  },
})
```

## Behavior

- Supports `true`/`false`, legacy nested relation maps, and custom include objects.
- Server converts include relations to Drizzle `with` using generated relation metadata.
- Relation include objects support `include`, `where`, `orderBy`, `columns`, and `limit`.
- If `params.with` is also provided, `params.with` is used instead of converted `include`.

## Requirements

- Relation keys must exist in generated collection relations.
- Keep include payload serializable (`SuperJSON` transport).

## Pitfalls

1. Unknown relation keys are ignored, which can hide typos.
2. Nested relation options run against the related collection, not the root collection.
