# ADR: pinned cursor pages for live query results

- Status: Proposed.
- Date: 2026-10-23.
- Scope: follow-up to [S06](./06-pinned-cursor-pages.md); no runtime API is implemented by this record.
- Decision owners: rstore query/page lifecycle and connector implementations.

## Context and evidence

S01–S05 provide page-scoped refresh/push callbacks, selected-page subscriptions, result versions and confirmation. They do not provide stable pagination boundaries. An offset insert shifts later pages even when every individual response is correct.

Repository search found no ADR directory, template or decision-record convention under `docs/` or `plans/`. This record uses the fallback location requested for S06. Recommendations below derive from current local code; external library behavior is not an acceptance dependency.

Current implementation constraints:

- [`createQuery.ts`](../../packages/vue/src/query/createQuery.ts): `getPage` reuses an indexed slot or appends; `fetchMore` accepts arbitrary option extensions. `refresh` reloads retained pages, supports a page-index subset, and resets pages after base options change. Query identity serializes base options; page identity is currently `queryId#index`.
- [`options.ts`](../../packages/vue/src/query/options.ts): function-valued options are not part of query, page, confirmation, push currency or subscription identity (`toSerializableOptions`/`equalFindOptions`); a function-only change reloads pages in place. Range identity must follow the same serializable rule, which is one more reason cursor mode rejects local function-only filter/sort options.
- [`page.ts`](../../packages/vue/src/query/page.ts): contiguous `computed` pages slice a single cache read by `index * pageSize`; `responseRefs` retains response membership/order; `no-cache` retains data. Variable-width bounded ranges cannot use these positional cache slices.
- [`load.ts`](../../packages/vue/src/query/load.ts), [`push.ts`](../../packages/vue/src/query/push.ts), [`result.ts`](../../packages/vue/src/query/result.ts): fetch and push publication share representation and version checks, reject stale/disposed work and reconcile ownership. Pushes do not write rows. Non-main pages publish behind a main-page publication barrier ([`publication.ts`](../../packages/vue/src/query/publication.ts)), not the main load's transport promise: each main load opens a barrier, released when that load settles or a pushed main result lands, and waiters follow any replacement main load.
- [`livePages.ts`](../../packages/vue/src/api/livePages.ts): subscriptions use page object, index, base options and merged page options as ownership checks. Metadata is shared across pages. Reindexing a cursor range therefore needs explicit reconciliation; an array slot cannot identify its subscription forever.
- [`dedupe.ts`](../../packages/core/src/query/dedupe.ts): ordinary metadata is copied to deduped consumers; special `$resultVersion` has explicit forwarding. [`obj.ts`](../../packages/shared/src/utils/obj.ts) excludes `$` fields from ordinary metadata copies. A new `$pageBounds` needs its own response forwarding and must not leak into the next request.
- [`prune.ts`](../../packages/vue/src/query/prune.ts) and [cache pruning](../../packages/vue/src/cache/prune.ts): explicit pruning deletes rows absent from the retained union across entire involved collections, even when sibling queries own them. A range split must never invoke this operation implicitly.
- [Cache state](../../packages/vue/src/cache/types.ts), [serialization](../../packages/vue/src/cache/api.ts), [hydration](../../packages/vue/src/cache/reset.ts), and [query-state invalidation](../../packages/vue/src/cache/queryState.ts) save refs/confirmation but no topology; invalidation parses a numeric page suffix. Cursor topology needs an additive, validated transport representation.

Existing behavioral examples to preserve:

- [`pagination.spec.ts`](../../packages/vue/test/integration/pagination.spec.ts): custom `params.after` append/refresh, sparse offset pages, page-scoped failure and retained content.
- [`pagination-results.spec.ts`](../../packages/vue/test/integration/query/pagination-results.spec.ts): computed cache slicing and exact `responseRefs` order.
- [`live-pages.spec.ts`](../../packages/vue/test/integration/query/live-pages.spec.ts): selected/all pages, immediate old-callback invalidation, shared reactive metadata, disposal and SSR without subscriptions.
- [`pushed-results-ordering.spec.ts`](../../packages/vue/test/integration/query/pushed-results-ordering.spec.ts) and [`confirmation.spec.ts`](../../packages/vue/test/integration/query/confirmation.spec.ts): per-page versions, supersession, deduped consumers, option changes and hydrated confirmation.

### Drizzle connector boundary

[`plugin/fetchHooks.ts`](../../packages/nuxt-drizzle/src/runtime/plugin/fetchHooks.ts) translates `pageIndex`/`pageSize` into `offset`/`limit`, sends `params` through SuperJSON and publishes a bare array. [`drizzleFindMany`](../../packages/nuxt-drizzle/src/runtime/server/utils/operations/findMany.ts) applies authorization/filter hooks, ordering, projection and a row limit, then returns an array. Its local server hook `meta` is not returned as query metadata. [`limits.ts`](../../packages/nuxt-drizzle/src/runtime/server/utils/limits.ts) defaults `maxLimit` to 1,000; omitting a limit does not remove that cap.

[`plugin/cacheHooks.ts`](../../packages/nuxt-drizzle/src/runtime/plugin/cacheHooks.ts) compares JavaScript values for local ordering. It cannot prove equality with database collation/null ordering. [`plugin-realtime.ts`](../../packages/nuxt-drizzle/src/runtime/plugin-realtime.ts) subscribes by collection/key/where and applies item updates to cache. [Server subscriptions](../../packages/nuxt-drizzle/src/runtime/server/realtime/subscriptions.ts) fan out matching item events; neither side maintains full ordered page results or range bounds. [`batchHook.ts`](../../packages/nuxt-drizzle/src/runtime/plugin/batchHook.ts) does not translate `fetchMany` operations. Drizzle is evidence of required connector work, not an existing pinned-page implementation.

## Decision 1: connector-issued cursors in response metadata

Recommend opaque, JSON-safe string cursors issued by the server connector. A cursor encodes the full normalized sort tuple plus every primary-key component as a unique tie-breaker. Comparisons follow query order, including mixed directions, null placement, collation and value precision. rstore stores/transports tokens and compares token equality only; it never decodes or sorts them.

Bounds represent values, not a lookup of the boundary row. Deleting or changing that row must not invalidate a bound. Server validation binds tokens to protocol version and query scope: collection, authorization/tenant context, filter, effective order, projection/includes and schema/collation version. Expired or mismatched tokens produce a typed error and an explicit query reset/retry path; no silent offset fallback. Tokens carry no authorization grant; every request repeats normal authorization and filter enforcement. Do not expose confidential sort values in readable tokens; use authenticated encoding or server handles where needed.

Reserve fetch/push `meta.$pageBounds` for a response descriptor with these proposed fields:

- `protocol`: literal `1`, identifying descriptor format.
- `scope`: opaque server query-scope identifier used to reject mixed cursor domains.
- `request`: detached echo of the effective `findOptions.pageBounds`, including kind and endpoints; publication must match the owning range generation.
- `firstCursor` and `endCursor`: cursors of the first/last **visible** rows in canonical query order; absent for empty results. `endCursor` is the forward sealing boundary, never the sentinel.
- `hasNext`: boolean for a tail; absent for bounded/reverse results. It means more rows existed at this result's version, not a permanent end-of-list guarantee.
- `hasPrevious`: boolean for a reverse result; absent otherwise.
- `splitCursor`: optional strict interior cursor recommending a partition of a bounded range.
- `lowerCursor`: reverse-only exclusive lower endpoint selected by the server; absent means negative infinity. Unlike `firstCursor`, it can refer to the hidden reverse sentinel.

Use existing fetch `meta.$resultVersion` and push `SetResultOptions.version` for ordering, rather than duplicating a version in bounds. Require a comparable `FieldTimestampValue` on every pinned result, including empty results, in one ordering domain per scope; connectors must supply monotonic server snapshot stamps, not client arrival times or maximum item timestamps. Equal versions for the same range must describe equivalent membership/bounds. S04's optional versioning remains unchanged outside this opt-in.

Store accepted descriptor on readonly `page.bounds`, and page application metadata on readonly `page.meta`; query-level ordinary `meta` keeps existing compatibility behavior. A per-page `page.meta` changes S02 `setResult(rows, { meta })` semantics: today a push's `meta`, like fetch metadata, merges into the query-wide `meta` whichever page it targets. Adopting `page.meta` must define which fields stay query-wide (such as `totalCount`) and which become per-page, and keep the query-wide merge for non-cursor queries. `$pageBounds` stays out of query-wide metadata and future request metadata. Forward it explicitly through deduplication, including background completion, as detached response data. Fetches, pushes, refs, bounds, version and confirmation must pass one ownership check and publish together. Rejected results change none of those fields.

**Alternatives:** collection `getCursor(item, sort)` is convenient but cannot recover server collation, hidden sort expressions or exact numeric values. Per-row cursor wrappers increase payload/row API complexity; keep them connector-private if needed to produce the descriptor. Query-wide bounds metadata races between pages; reject it as storage for range state.

## Decision 2: bounded find options and range semantics

Reserve `findOptions.pageBounds` as a versioned discriminated request:

- `protocol: 1` on every request.
- `kind: 'tail'`, optional `after`: read strictly after the lower cursor, in canonical order, requesting `pageSize + 1` internally.
- `kind: 'bounded'`, optional `after`, required `through`: read the whole interval `(after, through]`; no application page-size limit. Missing `after` means negative infinity.
- `kind: 'reverse'`, required `through`: read closest predecessors at or below this endpoint, internally requesting `pageSize + 1` in reverse order, returning visible rows in canonical order.

These are proposed fields, not additions to `params`. Endpoints are interpreted by the connector, never by rstore. `pageSize` is a target row count for open reads and rebalancing; it must not truncate bounded responses. `pageIndex` is UI position only in cursor mode and never produces an offset. Mutually incompatible bounds, offset/limit params or local function-only filter/sort options fail validation. A connector may support a restricted set of server sorts and must reject unsupported queries explicitly.

All membership-affecting bounds belong to request dedupe/cache identity and subscription comparison. The cursor mode belongs to base query identity. Per-range generated endpoints belong to stable page descriptors, not reactive base options, so advancing does not reset the whole query. Liveness selection remains outside find options as S03 requires.

Recommend a declared connector capability `collection.meta.cursorPagination` with `protocol: 1`, `liveResults: boolean` and `reverse: boolean`, supplied only by the owning remote connector after its fetch path supports this contract. `liveResults` additionally certifies full-result subscription/catch-up support; `reverse` certifies reverse reads. Live cursor queries require `liveResults: true`; backward loading requires `reverse: true`. Validate actual query shape at runtime too. Missing capability or missing/malformed metadata fails the page while preserving prior content; it never labels a truncated array complete. Existing connectors without capability retain existing offset/custom-cursor behavior.

**Alternatives:** putting bounds under connector `params` avoids a shared type but leaves lifecycle/identity semantics inconsistent. Client-side cursor comparisons require server sort parity. Automatic fallback to offsets would silently lose the guarantee consumers opted into.

### Completeness and server resource limits

“No limit” means no silent logical truncation, not permission to bypass server budgets. Connector must return the entire authorized interval or fail with structured `range-too-large` error plus a validated interior `splitCursor` when possible. A failed range result publishes no rows/bounds/confirmation; existing accepted content stays visible with its error lane. A split suggestion alone is control information, not a confirmed page result.

Connector may assemble bounded results from internal chunks only with a consistent database snapshot; publish once after full assembly. Otherwise stage complete child ranges and replace the parent atomically. Overflow error data carries protocol, scope, echoed request, server version and optional split cursor so stale suggestions cannot repartition a new range. If no legal interior split exists, surface the error; never retry without a bound. Initial tail/reverse requests must validate that server capacity can accommodate `pageSize + 1` before querying. Sentinel loss through a clamp must not yield false `hasNext: false`.

Drizzle must preserve `maxLimit` protection, introduce an explicit cursor response envelope for cursor requests only, and translate range overflow into this protocol. Legacy list requests keep their array response. REST client/server, any future list batching, and realtime protocol need coordinated version/capability negotiation before Drizzle advertises support.

## Decision 3: explicit opt-in and authoritative membership

Recommend `pagination: 'cursor'` on `q.many`/find-many options, with required positive integer `pageSize`; absent means current behavior. Support ordinary queries and live queries through the same page manager. Reject cursor mode on `first`. Defer collection defaults until an initial implementation proves explicit opt-in; capability is not an automatic default.

For cached cursor pages, resolve omitted `resultMode` to `responseRefs`; reject explicit `computed`. For `no-cache`, preserve plain data and identical range topology. Cache-only cursor reads can reuse a saved matching range descriptor and refs but cannot manufacture bounds or advance without a server result. Otherwise show an unconfirmed empty page; `fetchMore` reports that server bounds are unavailable. `cache-and-fetch` can display saved content while validating on the background lane. Never seed a cursor page from an arbitrary computed cache read.

Live consumers showing the full loaded window must opt into S03 `{ pages: 'all' }`. Other selections remain legal but only selected ranges stay live; no whole-window freshness claim. Main-page-only remains the default. Optimistic cache edits can change cached field values or remove refs; they do not predict server range membership/order. Connectors retain responsibility for writing pushed items with field timestamps before calling `setResult`; rstore still never writes items from a push.

**Alternatives:** bounded cache computation would require portable cursor decoding, complete cache coverage and exact backend sort parity; defer it. Silently keeping computed membership defeats server bounds. Collection defaults reduce typing but make rollout and unsupported-sort failures surprising.

## Decision 4: open tail, advance and refresh

Initial request is one open tail from negative infinity, unless an explicit initial `pageBounds` tail anchor resumes a window. Connector removes the extra sentinel before `setResult` and computes `hasNext`; sentinel must not enter page refs, cache ownership, rendered data or relation fetching through this result. The ordinary connector cache can contain that item for other reasons.

For a non-empty tail, forward `fetchMore()` captures its latest accepted `endCursor` as boundary B. Stage complete results for the sealed old range `(A, B]` and the new tail `(B, +infinity)` limited to the next target chunk. While staging, retain the old topology/data and its subscription. Install both descriptors/results in one publication step, then release old ownership/subscription. Empty/exhausted tails cause an idempotent no-op returning the current tail with no new slot; `hasNext: false` may later change on a live push.

Serialize topology transitions per query, including forward/backward loads and rebalancing, and coalesce simultaneous calls in the same direction onto one transition; a later call after completion advances again. Stage results under a topology generation. Refresh, base-option change, disposal or invalidated scope cancels the transition. A tail push newer than a staged sealed result prevents commit; retry from the latest accepted boundary rather than rolling back newer state. More generally, each replacement baseline must be at least as new as every accepted parent it replaces. Failed staging leaves the old tail/content intact and exposes the failure through existing foreground state; no half-created public page.

Staged ranges need their own generation-bound publication owner and buffered results; they cannot use the current public-page membership check before commit. Do not make staged children wait on the main-page publication barrier of the topology they will replace. Promote staged owners/results in one commit, then attach normal public-page ownership checks. Reuse shared representation/version/confirmation helpers without bypassing those guards for ordinary pages.

New range subscriptions must provide a baseline plus subsequent updates without a delivery gap. Connector must use replay/version handoff or subscribe-before-fetch buffering and recheck the accepted version. Merely fetching then subscribing is insufficient. Stage range subscriptions before commit; old callbacks become inactive synchronously at commit, before queued transport teardown. Retained cache rows transfer to new page owners before old owners release them.

Plain `refresh()` reloads current exact bounds without repinning them. `refresh({ pages: [...] })` resolves indexes to current range identities at invocation. Bound-changing options, pageSize, filter, sort, projection/include or authorization changes start a new query generation and discard old topology; do not reinterpret existing tokens. Reconnect refreshes retained bounds, opens subscriptions with catch-up and keeps existing data while fetching. Cache reset invalidates saved topology and rebuilds from the initial tail; scope mismatch requires an explicit reset rather than an automatic scroll jump.

**Alternatives:** seal on every push would move boundaries and recreate offset drift. Reuse only the old tail array without a bounded baseline can miss updates during handoff. Refetch the entire growing prefix is simpler but increases repeated work; leave it as an alternative for connectors that cannot implement range subscriptions.

### Consistency limits

Pinned adjacent intervals prevent offset-induced overlap/gaps after all affected ranges settle. Example with target size 2: ranges `(-infinity, 20]` and tail `(20, +infinity)` keep an inserted key 15 in the first range; tail does not shift. If boundary row 20 is deleted, the bound stays 20. If row 18 moves to 23, it eventually leaves the first range and enters the tail.

Independent page deliveries may temporarily show that moving row twice or omit it. S04 versions order results within a page; equal version domains do not coordinate publication across pages. S05 `confirmed` means each range has a server-confirmed result, not that the union represents one snapshot. Do not add arbitrary union deduplication that hides inconsistent page contents or claim transactional list consistency. Atomic topology transitions prevent structural half-splits but do not upgrade independent server snapshots. A future coordinated snapshot/batch-result protocol is needed for a single-snapshot union; it is outside this proposal.

## Decision 5: stable range identity and `fetchMore` migration

Cursor pages expose stable opaque `id` for one interval generation; `index` remains current display position. A page whose endpoints change is replaced. Cursor cache keys must include mode, base identity and full range descriptor, while subscription callbacks retain object/generation ownership. Do not depend on a reused index or parse every page id as a numeric suffix. Keep old offset identifiers/read paths backward compatible and add cursor state explicitly.

`fetchMore()` becomes the additive cursor-mode forward overload; it retains the hybrid promise `{ page }` result. Offset/custom-cursor queries keep today's required options overload, `fetchMore({ pageIndex })` and `fetchMore({ params: { after } })`. In cursor mode, reject arbitrary per-page option overrides and index jumps; caller must reset base options to change semantics. Existing custom cursors do not become pinned automatically and require explicit migration plus connector support.

In cursor mode, `getPage({ pageIndex })` only reads an existing display position and returns `undefined` when missing; a cursor-specific overload must express this return type. It must not create an unfetchable sparse range. `pages` is dense and ordered, containing committed ranges only. The empty bootstrap main page is the sole exception before first acceptance. `mainPage` follows the first committed range, including after splits/prepends; holding an old page object does not make its callbacks active. UI keys use `page.id`, not index. Recommend readonly page topology/options in cursor mode so mutation cannot bypass the range manager.

Expose readonly query `hasNext: Ref<boolean | undefined>` from the accepted tail (`undefined` before server knowledge), and `hasPrevious: Ref<boolean | undefined>` for anchored windows. They are separate from query metadata and confirmation. Pinning/splitting can change number and size of pages; page numbers cease to mean fixed row offsets.

**Alternatives:** reuse indexed ids needs error-prone ownership/version remapping on every prepend/split. Require applications to pass each next token repeats connector logic and cannot safely coordinate sealing. A separate pagination composable isolates APIs but duplicates query fetch/state/liveness; prefer mode-specific overloads in existing query API.

## Decision 6: split, merge and pruning

Recommend split when a complete bounded result exceeds `2 * pageSize`, using the connector's `splitCursor` nearest its median in canonical order. Never split at an endpoint. Replace `(A, B]` with `(A, S]` and `(S, B]` only after complete child baselines and subscriptions are ready. An overflow error may trigger the same transition. Recursively split children still above threshold, with bounded retry/work limits; on failure preserve old accepted page and surface error. Keep exactly one open forward tail.

For an empty bounded page `(A, B]`, merge coverage into its right neighbor by replacing `(B, C]` with `(A, C]`, or replacing tail `(B, +infinity)` with tail `(A, +infinity)`. Do not delete only the page object: that would abandon `(A, B]` and miss future inserts. If no right neighbor exists, retain coverage as an open tail. Stage the expanded range, then replace atomically. Defer nonempty automatic merges to avoid churn; keep a zero-row range while merge preparation fails. Two adjacent empty ranges follow the same rule.

Split/merge does not delete shared cache items or create tombstones. Acquire child/expanded-range ownership and included-relation ownership before releasing parent ownership, reusing existing query tracking/GC. `refresh({ prune: true })` is rejected in cursor mode before any fetch or cache deletion. An incomplete loaded window cannot justify collection-wide pruning, and current pruning intentionally ignores sibling ownership. Ordinary refresh replaces response refs only; users can use existing ownership-aware GC for unreferenced items. Offset-mode explicit pruning remains unchanged.

Persist refs, descriptor, version, confirmation and topology together for cache remount/SSR, with a protocol version and scope. Hydration validates adjacency, single tail, unique range identities and complete saved records; incompatible/legacy cursor state is discarded conservatively and starts unconfirmed. `no-cache` data remains unpersisted as today. Server-side queries fetch requested ranges but open no realtime subscriptions. Active topology is invalidated by item/cache reset only through the documented cache lifecycle; retained saved refs alone cannot reconstruct ranges.

**Alternatives:** global prune over child unions preserves current explicit pruning semantics but can delete sibling/unloaded rows; reject for cursor mode. Drop-empty without widening a neighbor loses future coverage. Merge all small pages automatically adds fetch/subscription churn and unstable scroll anchors; defer until measured need.

## Decision 7: reverse chunk and prepends

Default first bounded range starts at negative infinity, so inserts before its current first row already belong to it. No extra overlapping prepend subscription is needed. Its growth uses normal splitting. `hasPrevious` is false for this unanchored mode.

An explicitly anchored initial tail after A omits `(-infinity, A]`. Add `fetchMore({ direction: 'before' })` only with reverse support. Request `kind: 'reverse', through: A`; select nearest predecessors in reverse order with a sentinel, then return visible rows in canonical order. If sentinel cursor is L, the committed prepend is `(L, A]` and the uncovered prefix becomes `(-infinity, L]`. Without sentinel, lower endpoint is negative infinity and `hasPrevious` becomes false. Sentinel row is excluded now and belongs to the next reverse chunk. This convention includes A, which the existing tail excludes, without a seam gap.

Before commit, convert the reverse response to its exact bounded range and establish its bounded live baseline/subscription, using the same staging/version rules as forward advancement. Never keep a limited reverse subscription adjacent to the old prefix: its moving lower edge would lose loaded rows. Repeated reverse calls coalesce and preserve stable identities of unaffected ranges. UI scroll anchoring remains consumer responsibility using stable row keys; core adds no DOM behavior.

**Alternatives:** always maintain a prepend chunk overlaps the negative-infinity first range. Treat reverse paging as negative page indexes breaks current array/refresh APIs. Defer reverse capability for forward-only connectors and report it explicitly; do not simulate it with offsets.

## Consequences and acceptance gate

Benefits: offset drift is removed for settled ranges, connector sort semantics remain authoritative, custom/offset APIs stay compatible, and cache membership/row causality remain separate.

Costs: page-scoped metadata and saved topology, more complex atomic range transitions, connector-issued versions, full-result live subscriptions, overflow handling and explicit cursor API overloads. Bounded pages can grow; memory, response size and transition work need limits. Independently live ranges still provide eventual consistency for cross-range moves.

This record remains **Proposed**. Approval of cursor capability/metadata names, mode-specific API behavior, prune rejection, overflow transport and eventual consistency guarantee is required before production implementation. No existing connector is certified by this design. Follow-up slices and behavioral acceptance scenarios are listed in [S06](./06-pinned-cursor-pages.md#follow-up-implementation-slices).
