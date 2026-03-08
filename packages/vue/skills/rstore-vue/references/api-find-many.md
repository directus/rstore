| name | description |
| --- | --- |
| `api-find-many` | Reference for collection `findMany(...)` |

# findMany

## Surface

One-shot async read for matching items.

## Syntax

```ts
const items = await store.todos.findMany({
  fetchPolicy: 'cache-first',
})
```

## Behavior

- Uses fetch policy, cache hooks, and adapter plugin hooks.
- Returns wrapped item array.

## Requirements

- Query params/where shape should match plugin expectations.

## Pitfalls

1. Use `query` when you need reactive loading/error refs.
