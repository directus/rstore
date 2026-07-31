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

- Exposes `data`, `loading`, `error`, `foreground`, `background`, `refresh`, `pages`, `mainPage`, `fetchMore`, `getPage`, `meta`.
- `loading` is `foreground.loading || (background.loading && no data)`; `error` is `foreground.error ?? background.error`.
- `foreground` covers blocking fetches (initial load, `refresh`, `fetchMore`), `background` covers the silent `cache-and-fetch` revalidation. Each exposes `loading`, `error`, `completed`, `lastUpdated` and a never-rejecting `promise`. Pages expose the same pair.
- `resultMode: 'computed'` reads the result from the cache using the query options.
- `resultMode: 'responseRefs'` preserves backend response order by mapping stored refs back to cached items.

## Requirements

- Use stable option shapes to avoid unnecessary query-id churn.

## Pitfalls

1. Assuming `no-cache` behaves like cache policies causes stale expectations.
