# S06: pinned cursor pages (design)

- Status: design delivered on 2026-10-23; ADR Proposed, awaiting contract agreement before implementation.
- Depends on: S03.
- Owner: page boundaries of live lists showing several pages at once.
- Contract: [overview](./00-overview.md).

## Problem

With offset pages, each followed page is consistent on its own, but the pages are not consistent with each other. An insert before page k shifts the membership of every later page, so rows get duplicated or skipped at page edges, and pushes for different pages describe different snapshots.

TanStack DB's source warns about exactly this: refetching each ordered page alone keeps a row that now sorts between two pages in neither result. Numbered-page tables showing one page at a time are fine with offsets (S03). Infinite lists and "load more" lists are not.

## Candidate model (Convex / InstantDB)

1. **Pin on first load.** After a page first loads, record its end bound: the sort tuple plus primary key of its last row.
2. **Bounded pages.** A pinned page is requested as `(previous page's end bound, own end bound]` with no limit. It grows or shrinks with membership but never shifts.
3. **Open tail.** Only the last page stays open: `after previous end bound`, `limit pageSize + 1` (sentinel for `hasNext`).
4. **Split and merge.** A pinned page growing past a threshold (for example 2 × `pageSize`) splits at a server-provided `splitCursor` (Convex `SplitRecommended`). An empty pinned page is dropped.
5. **Prepends.** A reverse chunk before the first page catches rows inserted before the list start (InstantDB).

## Open questions to settle before implementation

- **Who computes cursors.** Options:
  - a collection-level `getCursor(item, sort)` hook;
  - cursors returned in fetch meta (`meta.$pageBounds`), keeping rstore ignorant of sort semantics.
  - Recommended: meta, because connectors own sort and collation.
- **How bounds reach fetch hooks.** A reserved `findOptions.pageBounds = { after?, through? }` that connectors translate into keyset filters. Connectors without keyset support stay on offset pages.
- **Opt-in.** A `pagination: 'cursor'` query option, a collection default, or both.
- **Relation to `computed`.** Can pages of a `computed` query be sliced from a bounded cache read, or do cursor pages imply `responseRefs`?
- **Pruning.** Interaction with `refresh({ prune: true })` when pages split.
- **`fetchMore` API.** Today it takes `pageIndex` or connector params (`after`); decide the migration.

## Deliverables

- An ADR covering the chosen contract: [pinned cursor pages](./adr-pinned-cursor-pages.md), status **Proposed**. No existing ADR/decision-record convention was found under `docs/` or `plans/`, so this uses the requested fallback location beside this slice.
- Then a follow-up implementation plan series split into: bounds in meta, bounded fetch options, tail and sentinel, split/merge, reverse chunk.

## Exit gate

Contract agreed and recorded. No code in this slice.

## Follow-up implementation slices

These are proposed future slices, not authorization to implement them in S06. Create their numbered plan files after ADR agreement. Preserve S01–S05 behavior outside explicit cursor mode. Each future slice must write behavioral tests first, retain failing-first logs, run focused suites in their actual Vitest project, types, scoped ESLint and full tests, and record its own receipt. Keep new source/test files below 300 lines and reuse the shared real-store/FakeRemote harness; expand its external-backend behavior only where required, without sharing production cursor evaluators.

### P01: bounds in metadata, identity and saved topology

- Depends on ADR acceptance. Own shared cursor descriptor types and publication/storage prerequisites; do not enable a partially working cursor mode yet.
- Likely files: `packages/shared/src/types/{query,hooks/meta,hooks/realtime}.ts`, `packages/core/src/query/dedupe.ts`, `packages/vue/src/query/{types,result,page,push,load}.ts`, `packages/vue/src/cache/{types,api,writes,queryState}.ts`, `packages/vue/src/types.ts`. Extract new focused cursor metadata/state helpers rather than growing existing files.
- Define request/response descriptor protocol, capability (`protocol`, `liveResults`, `reverse`), scope validation, readonly `page.bounds`/`page.meta` and mode-specific stable page identity. Separate transport `$pageBounds` from query-wide metadata. Copy it explicitly for every deduped consumer, including background completion; do not copy tracking or publication guards.
- Reserve one topology generation for staged transitions. Accept bounds, refs/data, result version and confirmation together through fetch/push ownership checks. Reject missing/mismatched descriptors and absent versions for cursor results; offset results retain current optional metadata/version semantics.
- Add versioned saved cursor topology alongside current refs, not inside global `queryMeta`. Update cache-key parsing, invalidation, SSR serialization/hydration and remount paths to support cursor identities while retaining numeric offset keys. No-cache pages remain unpersisted. Invalid saved cursor state starts conservatively unconfirmed.
- Behavioral tests: two pages settling in reverse order keep separate bounds/meta; stale/disposed pushes change neither rows nor bounds; same-key stale fetch cannot overwrite pushed rows or descriptors; deduped consumers receive detached matching descriptors; background metadata reaches every consumer; cursor/offset queries never share saved refs. Hydrated adjacency/scope/tail validation rejects malformed topology; legacy hydration and confirmed absence stay compatible.
- Docs: `docs/guide/plugin/hooks.md` documents response descriptor/version responsibility; `docs/guide/data/query.md` describes proposed page metadata and saved-state behavior. Keep unreleased APIs marked experimental until P03 enables them.
- Exit: metadata/state prerequisites pass existing ordering, confirmation, hydration, cache and public-type contracts, with cursor activation still gated.

### P02: bounded fetch options and first connector support

- Depends on P01. Own request validation and connector protocol; only connectors proving complete ranges may advertise capability.
- Likely files: `packages/shared/src/types/query.ts`, Vue query option resolution/helpers, Core find-option identity/marker paths discovered during implementation; `packages/nuxt-drizzle/src/runtime/plugin/{fetchHooks,cacheHooks}.ts`, server `utils/{index,limits,conditions}.ts`, `utils/operations/findMany.ts`, and dedicated small cursor codec/range/response modules. Do not replace existing condition, key or wire serializers with parallel copies.
- Define explicit `pagination: 'cursor'`, required `pageSize`, effective `responseRefs`, `no-cache` support and illegal computed/offset/local-function combinations. Query identity includes cursor mode; generated range bounds affect page/dedupe identity without changing reactive base options. Reject cursor mode on first queries and reject `prune: true` before side effects.
- Implement tail/bounded wire descriptors and server-issued opaque scope-bound cursors. Handle sort ties, mixed direction, nulls, all primary-key components, selected columns omitting sort fields, deleted boundary rows and token validation. Connector computes hidden cursor fields server-side; never append them to public records unless already selected.
- Introduce a cursor-only response envelope carrying rows/bounds/version, while legacy REST array responses remain unchanged. Keep authorization hooks, filters, relation limits and maximum row protection. Complete bounded result or structured overflow error; no clamped “complete” response. Internal chunk assembly requires one database snapshot.
- Audit current list batching fallback and relation reads. Current Drizzle batch translator does not support fetchMany; preserve fallback unless explicitly adding parity. Cursor metadata must not be inherited by unrelated relation reads.
- Drizzle live support requires an explicit full-range result protocol, not only existing item-event fan-out. Add versioned capability negotiation, range-aware subscription identity, per-subscriber baseline/catch-up and server reevaluation. Keep protocol compatibility tests for old clients/item subscriptions. Do not advertise live capability until these work; if this connector work exceeds one slice, split into P02a HTTP and P02b realtime with separate receipts and dependencies.
- Behavioral tests: real connector HTTP/in-memory SQL boundary proves keyset predicates, tied sorts, deleted/updated endpoints, scoped-token rejection, authorization and server caps. Assert exact rows/order and truthful overflow rather than generated SQL text. Full-result realtime tests prove both old and new membership when a row crosses a bound, including same-key field changes and reconnect baseline races. Old offset/list/batch callers keep wire behavior.
- Docs: `docs/plugins/nuxt-drizzle.md`, hook and query guides describe capability restrictions, overflow/version requirements and current compatibility. No connector certification before its behavior tests pass.
- Exit: connector returns complete, versioned bounded results and valid tail metadata; runtime activation still waits for P03 lifecycle support.

### P03: tail, sentinel and forward page lifecycle

- Depends on P01/P02, including a result-capable live connector for live activation. Own additive cursor query API and atomic forward transitions.
- Likely files: `packages/vue/src/query/{createQuery,types,page,load}.ts`, new small cursor topology/tail/transition modules, `packages/vue/src/api/{types,query,livePages}.ts`, and collection API typings. Keep generic query/fetch state helpers shared with offset mode.
- Add no-argument cursor `fetchMore()` overload, mode-specific existing-only `getPage`, readonly topology, stable range ids and query `hasNext`/`hasPrevious`. Existing offset/custom-cursor overloads keep their signatures/behavior. Cursor `pages` contains only committed ranges; `mainPage` follows the first range after replacement.
- Strip sentinel inside connector before cache writes, relation reads or result publication. First tail is open; advance captures accepted visible end cursor, stages sealed range plus new tail and commits both atomically. Serialize all topology transitions, coalesce same-direction advances and never create sparse public cursor pages. Staged owners buffer generation-checked results independently of public-page membership/main-page waits; promote them atomically. Empty/exhausted tail returns current page without a new request/slot.
- Keep accepted content/subscriptions active while staging. Buffer/replay new subscription baselines so handoff loses no updates. Transfer item/relation ownership before releasing replaced ranges. Invalidate callbacks by object/range generation before queued unsubscribe, including reindexing under S03 policies.
- Refresh exact retained bounds, preserve versions on same-range refresh, map subset indexes at invocation, cancel staged transitions on base/reset/disposal changes and retry when newer tail acceptance invalidates staged data. Initial cache-only state cannot invent cursors; saved content remains visible during background validation. Enable explicit cursor mode only once this lifecycle works.
- Behavioral tests: insert before first page does not shift later membership; boundary deletion does not move endpoints; sentinel absent from data/cache writes caused by this query/ownership/relation reads; repeated/concurrent advance creates exactly one next range; no next request without authoritative bounds; exhausted tail later receives new live rows. Staging failure preserves old data/topology and settles error/loading correctly. Push versus held sealed fetch, refresh versus advance, disposal and options change reject old data/bounds. SSR opens no subscriptions. Existing sparse offset and custom `params.after` suites remain unchanged.
- Docs: `docs/guide/data/{query,live}.md` and `docs/guide/plugin/hooks.md` cover API migration, `{ pages: 'all' }`, exact-bound refresh, responseRefs, confirmation versus whole-window consistency, and connector cache-write responsibility. Update canonical skill references using `SKILLS-GENERATION.md` at public release.
- Exit: full forward window stays complete after settled insert/delete changes, without offset drift or fetch after every accepted push. Cross-range movement remains explicitly eventually consistent.

### P04: split, empty-range merge and ownership

- Depends on P03. Own topology rebalancing/overflow recovery; do not modify global cache-prune semantics.
- Likely files: cursor topology/transition helpers from P03, new split/merge modules, connector split metadata/overflow path and query tracking integration. Reuse established ownership and relation tracking rather than adding another collector.
- Split bounded pages over `2 * pageSize` or after range overflow, using a server-validated strict interior split cursor. Stage complete children and live baselines, publish one topology replacement and retain one forward tail. Bound recursive work/retries; preserve old accepted content/error when recovery fails.
- Empty bounded range merges coverage into its right neighbor or tail. A dropped page must never leave an unsubscribed interval. Defer automatic nonempty merges. Reindex display positions while preserving ids and subscriptions of unchanged ranges; old replaced page callbacks return inactive.
- Reconcile child/merged item and relation ownership before parent release. No tombstones or implicit pruning; keep sibling query rows. Ensure saved topology/remount reflects the atomic committed state, never staging.
- Behavioral tests: threshold split covers each seam once after settlement, with sort ties; overflow never publishes partial/confirmed rows; child failure leaves parent usable; superseded splits cannot resurrect pages; empty page merge still receives a later insert inside the formerly empty range; adjacent empties converge without coverage loss. Same-key row movement across a split converges after out-of-order pushes, without claiming cross-page snapshot consistency. Sibling/included rows survive and unowned rows remain collectable. `prune: true` rejects before remote/cache effects.
- Docs: query/live guides explain variable page sizes, stable keys, split/merge behavior, range errors and cursor pruning restriction. Hook/connector docs specify split suggestions are not successful results.
- Exit: structural replacements are atomic, range coverage survives empty pages, cache ownership remains valid, and resource limits cannot become silent truncation.

### P05: reverse chunk and anchored windows

- Depends on P04. Own reverse capability and prepend lifecycle; default negative-infinity first range remains unchanged.
- Likely files: public cursor query overloads, existing topology/transition helpers, a focused reverse-range module, connector reverse predicate/metadata path and subscription handoff. Share forward transition scaffolding rather than duplicating a second manager.
- Add `fetchMore({ direction: 'before' })` for supported anchored windows. Reverse request is inclusive through current lower bound; server reads closest predecessors in reverse, returns canonical row order, drops sentinel and provides exclusive `lowerCursor` plus `hasPrevious`. Absent lower cursor means negative infinity.
- Establish exact bounded baseline/subscription for the prepend before one topology commit. Reuse coalescing, cancellation, ownership-transfer and stale-callback rules. Preserve unchanged page ids as indexes move; mainPage follows first range. Reject unsupported reverse mode explicitly; never emulate it with offsets.
- Behavioral tests: default first range receives earlier inserts without a duplicate chunk; anchored window prepends include old lower-bound row exactly once; reverse sentinel belongs to the next chunk; mixed direction/ties preserve order. Repeated reverse loads, exhausted prefix, empty result, concurrent forward/backward transitions, reconnect and options/disposal races preserve rows/bounds/loading. Held index-based refresh cannot refresh the wrong range after prepend. SSR/remount saves the expanded topology.
- Docs: query/live/connector guides cover anchors, `hasPrevious`, reverse capability and consumer scroll anchoring via stable keys. Sync canonical skill API references through established generation.
- Exit: anchored windows grow backward without overlap/abandoned seams, and default unanchored windows need no extra prepend subscription.

## Implementation receipt

- Status: design delivered on 2026-10-23; ADR remains **Proposed**. Contract agreement gate remains open. No production code or tests written; no staging, commit or push.
- Changed files:
  - New `plans/live-query-results/adr-pinned-cursor-pages.md`: context grounded in current query/page/fetchMore/livePages/push, deduplication, pruning, hydration and Drizzle fetch/realtime code; recommendations and alternatives for all six open questions, plus limits, reverse coverage, stable identity and consistency guarantees.
  - `plans/live-query-results/06-pinned-cursor-pages.md`: status, ADR link, five follow-up implementation slices with dependencies, file scope, behavior tests, docs and acceptance gates, and this receipt.
- Failing-first evidence: not applicable. Explicit design-only instruction supersedes implementation tests-first rules; no failing tests were authored or run.
- Commands and results:
  - Initial `pnpm exec eslint plans/live-query-results/adr-pinned-cursor-pages.md plans/live-query-results/06-pinned-cursor-pages.md` failed before ESLint started: `mise ERROR Read-only file system (os error 30)`.
  - Reran the same command with installed Node 26.2.0 and standalone pnpm first on `PATH`, bypassing the mise shim: **passed**. Environment prefix: `PATH=/home/akryum/.local/share/mise/installs/node/26.2.0/bin:/home/akryum/.local/share/pnpm:/usr/bin:/bin`.
  - Local Markdown link check: **30 file links resolved** across the two owned files. Final design review checked all six original open questions, alternatives, connector limitations and five follow-up slices.
  - `git diff --check`: **passed** for tracked changes; separate owned-file whitespace review covers these currently untracked plan files.
  - Vitest, `pnpm test:types` and `pnpm test`: **intentionally not run**, per design-only override. No runtime/type behavior changed; ESLint on authored Markdown is the requested validation gate.
- Limitations / follow-ups:
  - Proposed API names/overloads, capability negotiation, prune rejection, overflow transport and eventual-consistency guarantee need contract agreement before implementation. Design completion does not certify a connector or satisfy the agreement part of the original exit gate.
  - P02 may need separate HTTP/realtime implementation slices. Drizzle currently supplies item events and capped arrays; server range results, cursor metadata, server snapshot stamps and catch-up handoff are future work.
  - Independent range pushes can temporarily duplicate/omit rows moving across boundaries; coordinated single-snapshot publication is a separate future protocol.
  - Only the two documentation files above belong to this slice. Existing dirty files and S01–S05 work were read for evidence and left untouched.
