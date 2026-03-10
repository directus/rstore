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
- `resultMode: 'computed'` reads the result from the cache using the query options.
- `resultMode: 'responseRefs'` preserves backend response order by mapping stored refs back to cached items.

## Requirements

- Use stable option shapes to avoid unnecessary query-id churn.

## Pitfalls

1. Assuming `no-cache` behaves like cache policies causes stale expectations.
