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
- One subscription per followed page receives required resolved `findOptions`: base + page options, store defaults, and `resolveFindOptions` transforms with current metadata. Keyed `first` queries also pass top-level `key`. `unsubscribe` receives opening options/key; hook mutations cannot alter the retained snapshot. The page policy stays outside find options and query identity.
- Connector `setResult(result, { meta, version, fieldTimestamps })` clones raw accepted rows and timestamps before parsing and writing, then publishes only the followed page without fetching. Writes include query tracking and embedded relations; `no-cache` exposes wrapped items (item API, computed fields and relations) and skips cache writes. Pass raw rows directly without pre-writing. Cache writes release relevant absence in other computed queries. Local filter/page changes retain pushed ownership like fetched results until replacement or disposal. Queued pushes write only when published; dropped, stale and inactive pushes write nothing. `fieldTimestamps` accepts a shared map or per-row maps index-aligned with the result array, with equal length (development warning on mismatch); use one map for `first`. `meta` excludes reserved `$`-prefixed fields; pass the version as `version`. It returns `'applied'` (accepted: the main page publishes at once, other pages queue until the main page has a result and can still drop the push if the query is disposed/disabled, the page is removed or its options change, a later unversioned push or a new fetch supersedes an unversioned push, or a newer version lands), `'stale'` (older version) or `'inactive'` (disposed, disabled, deselected, replaced or server-ended subscription). `refresh(options?)` refetches only that page, overriding any supplied `pages` list. Plain `subscribe()` receives none of `setResult`, `refresh` or `end`.
- Cached pushes reference rows written by rstore; `no-cache` pushes expose parsed values. Use `responseRefs` for server-controlled membership; computed pages remain cache slices.
- Fetch `meta.$resultVersion` and push `version` order snapshots per page using Core's `compareHLC` (finite numbers or serialized HLC strings). `setResult` throws `TypeError` for other formats; other fetch formats warn and count as unversioned. Older pushes return `'stale'`; older fetches complete without replacing data/meta. Equal versions apply; newer in-flight fetches can replace versioned pushes.
- Refresh retains versions; base query option changes reset them. Unversioned results bypass comparison and clear the page version; unversioned pushes supersede pending fetches. A versioned push drops the unversioned result of a fetch already in flight (fetches started later apply). rstore removes `$resultVersion` from published query metadata. Pass item `fieldTimestamps` through `setResult` to preserve field-level LWW and tombstone protection.
- Subscription identity compares resolved reads, excluding functions and `fetchPolicy`, `dedupe`, `experimentalGarbageCollection`, `fetchOptions` (including `autoRefresh`). Raw differences that resolve equally keep transport; metadata-driven resolution changes reopen it. `resultMode` remains part of identity.
- Selection/options changes reconcile subscriptions; function identity alone does not reopen them (function-only changes reload pages in place). Refresh overrides shape loads only and never change subscription `findOptions`, so `payload.refresh({ resultMode: 'responseRefs' })` keeps the same subscription. Disabled/server queries do not subscribe; scope disposal closes all page subscriptions. Late `setResult` callbacks return `'inactive'`.
- Refreshes when `realtimeReconnectEventHook` is triggered after realtime transport recovery.
- `end({ reason, retry })` reports server termination and immediately fences all callbacks from that subscription. `retry: true` closes and reopens through the query queue with three attempts at 1, 2 and 4 seconds, then refreshes once after reopening or final failure. Repeated ends and failed registration share a budget until an accepted push or successful refresh confirms a healthy replacement; registration alone does not reset it. `retry: false` closes and refreshes once without reopening. Identity changes, deselection, disabling and disposal cancel pending recovery; client-only option changes retain the budget. Plain subscriptions have no `end` callback.
- Readonly `query.live.value` is true only when at least one existing page is selected and all selected pages finished subscribing; false during registration, backoff, permanent termination, disabling, disposal, SSR and ordinary queries. It reflects hook registration, not transport acknowledgement unless the connector waits for one.

## Requirements

- Requires plugin/runtime support for subscriptions to be meaningful.

## Pitfalls

1. Offset pages can shift relative to each other after inserts/deletes, causing gaps or duplicates across displayed pages. Keeping several displayed pages consistent with each other is not supported yet.
2. Using `liveQuery` without subscription-capable plugins gives query behavior without realtime updates.
