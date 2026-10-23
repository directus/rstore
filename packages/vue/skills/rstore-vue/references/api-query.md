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

- For live pagination, `liveQuery(builder, { pages: () => [current.value] })` follows selected existing pages; `'all'` follows every existing page. `query` itself has no subscription policy.
- Exposes `data`, `confirmed`, `loading`, `error`, `foreground`, `background`, `refresh`, `pages`, `mainPage`, `fetchMore`, `getPage`, `meta`.
- `confirmed` is a readonly ref requiring every existing page to be server-confirmed; each page exposes readonly `confirmed`. Fetches and accepted pushes confirm even empty/missing results. Cache-only reads, cache-first hits without saved confirmation, and cache-and-fetch cache guesses do not. Effective option changes clear confirmation immediately; cache resets and `$cache.clearCollection` (no refetch; `no-cache` pages unaffected) clear it until the next server result; local writes and unchanged-option refreshes preserve it. Saved refs retain confirmation across remounts and SSR hydration. Confirmation compares serializable options only (like the query id): new inline function callbacks after re-render, remount or SSR hydration keep confirmation; function-only changes reload pages in place without unconfirming. Pair server-relevant callback changes with a serializable option change. Older payloads without confirmation stay unconfirmed until fetched/pushed. No-cache values are not cached/hydrated. Computed membership can still drift with local writes.
- Function-valued options (such as `filter`) do not identify the query or its pages: a function-only change keeps pages and reloads them in place. Serializable option changes reset pages.
- `refresh(options)` overrides shape reloads without being stored on `mainPage.options`, which only keeps a `pageIndex` passed to `refresh`.
- `$cache.getState()` carries page refs with their effective options and confirmation; `setState` restores them, so hydrated queries with matching effective options reuse them without fetching.
- `loading` is `foreground.loading || (background.loading && no data)`; `error` is `foreground.error ?? background.error`.
- `foreground` covers blocking fetches (initial load, `refresh`, `fetchMore`), `background` covers the silent `cache-and-fetch` revalidation. Each exposes `loading`, `error`, `completed`, `lastUpdated` and a never-rejecting `promise`. Pages expose the same pair.
- Fetch hooks can set `meta.$resultVersion` (finite number or serialized HLC string; other formats warn and count as unversioned) to reject older page snapshots. Equal versions apply; stale fetches finish without replacing metadata. Refresh retains versions; base option changes reset them. Unversioned results bypass comparison and clear the page version. rstore removes `$resultVersion` from published query metadata.
- `resultMode: 'computed'` reads the result from the cache using the query options.
- `resultMode: 'responseRefs'` preserves backend response order by mapping stored refs back to cached items.

## Requirements

- Use stable option shapes to avoid unnecessary query-id churn.

## Pitfalls

1. Assuming `no-cache` behaves like cache policies causes stale expectations.
