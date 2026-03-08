| name | description |
| --- | --- |
| `api-query` | Reference for collection `query(...)` |

# query

## Surface

Reactive query builder returning refs and paging controls.

## Syntax

```ts
const q = await store.todos.query(b => b.many({ fetchPolicy: 'cache-first' }))
await q.refresh()
```

## Behavior

- Exposes `data`, `loading`, `error`, `refresh`, `pages`, `mainPage`, `fetchMore`, `meta`.

## Requirements

- Use stable option shapes to avoid unnecessary query-id churn.

## Pitfalls

1. Assuming `no-cache` behaves like cache policies causes stale expectations.
