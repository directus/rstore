| name | description |
| --- | --- |
| `api-live-query` | Reference for collection `liveQuery(...)` |

# liveQuery

## Surface

Reactive query with subscription lifecycle.

## Syntax

```ts
const current = ref(0)
const q = store.todos.liveQuery(b => b.many({ pageSize: 25 }), {
  pages: () => [current.value],
})
await q.fetchMore({ pageIndex: 1 })
current.value = 1
```

## Behavior

- Published pushes confirm the followed page without fetching. `query.confirmed.value` requires every existing page; `page.confirmed` is a readonly boolean. Cache guesses remain unconfirmed, options changes, cache resets and `$cache.clearCollection` clear confirmation, and local writes preserve it.
- Builds on query behavior and manages subscription updates. The subscribe hook runs after the query has started its first load.
- The second argument accepts `pages: 'main'` (default), `'all'`, or an index array/ref/getter. Only existing selected pages subscribe; missing indexes wait until their pages exist.
- One subscription per followed page receives base options merged with page-specific options, including cursor params. The page policy stays outside find options and query identity.
- Connector `setResult(result, { meta, version })` publishes only the followed page without fetching or writing cache items. `meta` excludes reserved `$`-prefixed fields; pass the version as `version`. It returns `'applied'` (accepted: the main page publishes at once, other pages queue until the main page has a result and can still drop the push if the query is disposed/disabled, the page is removed or its options change, a later unversioned push or a new fetch supersedes an unversioned push, or a newer version lands), `'stale'` (older version) or `'inactive'` (disposed, disabled, deselected or replaced subscription). `refresh(options?)` refetches only that page, overriding any supplied `pages` list. Plain `subscribe()` has neither callback.
- Cached pushes reference connector-written rows; `no-cache` pushes expose supplied values. Use `responseRefs` for server-controlled membership; computed pages remain cache slices.
- Fetch `meta.$resultVersion` and push `version` order snapshots per page using Core's `compareHLC` (finite numbers or serialized HLC strings). `setResult` throws `TypeError` for other formats; other fetch formats warn and count as unversioned. Older pushes return `'stale'`; older fetches complete without replacing data/meta. Equal versions apply; newer in-flight fetches can replace versioned pushes.
- Refresh retains versions; base query option changes reset them. Unversioned results bypass comparison and clear the page version; unversioned pushes supersede pending fetches. A versioned push drops the unversioned result of a fetch already in flight (fetches started later apply). rstore removes `$resultVersion` from published query metadata. Item `fieldTimestamps` still protect connector cache writes.
- Selection/options changes reconcile subscriptions; function identity alone does not reopen them (function-only changes reload pages in place). Refresh overrides shape loads only and never change subscription `findOptions`, so `payload.refresh({ resultMode: 'responseRefs' })` keeps the same subscription. Disabled/server queries do not subscribe; scope disposal closes all page subscriptions. Late `setResult` callbacks return `'inactive'`.
- Refreshes when `realtimeReconnectEventHook` is triggered after realtime transport recovery.

## Requirements

- Requires plugin/runtime support for subscriptions to be meaningful.

## Pitfalls

1. Offset pages can shift relative to each other after inserts/deletes, causing gaps or duplicates across displayed pages. Keeping several displayed pages consistent with each other is not supported yet.
2. Using `liveQuery` without subscription-capable plugins gives query behavior without realtime updates.
