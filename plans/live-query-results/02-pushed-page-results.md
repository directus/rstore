# S02: pushed page results

- Status: verified on 2026-10-23; landed in `4dd1de55`.
- Depends on: S01.
- Owner: publishing a non-fetched result into a query page.
- Contract: [overview](./00-overview.md).

## Outcome

A realtime connector that receives a server-computed result for a live query publishes it with `payload.setResult(result, { meta })`. The query shows it exactly as if a fetch had returned it, without a request. Any fetch of that page still in flight is superseded.

## API

```ts
type SetResult = (result: unknown, options?: { meta?: CustomHookMeta }) => SetResultOutcome
// 'applied' | 'stale' (S04) | 'inactive' (query disposed, disabled or resubscribed)
```

- Only live query subscriptions receive it. Before S03 it targets the main page; S03 scopes it to the followed page.
- `result` has the shape `findMany`/`findFirst` hooks return after parsing: an item array for `many`, an item or `null` for `first`.
- The connector must have written the items into the cache first, with `$cache.writeItem` and `fieldTimestamps`. `setResult` only references them.
- `meta` is merged into the query meta like fetch meta (`updateQueryMeta`); for example `totalCount`.

## Semantics

1. **Supersede.** Assign the page a new `requestId`, so any fetch in flight for that page fails `isCurrentPageRequest` and is dropped by the existing paths, including `collectUnreconciledTracking`. A page's in-flight foreground lane settles as superseded.
   - Its spinner must not flip to complete. The pushed result counts as a completed foreground load of the page, so `completed` becomes true and `lastUpdated` advances.
   - Add a lane helper rather than calling `start`/`settle` on the push path.
2. **Representation.** Reuse `setPageResult` / `setPageRepresentation` with the query's resolved fetch policy and result mode:
   - `no-cache`: `{ type: 'data' }`;
   - `responseRefs` or a non-paginated `computed` query: refs or ref;
   - paginated `computed` pages: stay computed and only meta updates, because membership comes from the cache read.
3. **Tracking.** With query tracking enabled, call `handleQueryTracking(page.id, trackingFrom(result), …)`. That way GC ownership follows the pushed rows, and rows that left are released, not deleted. `include` relations follow the page's find options.
4. **Main-page wait.** A non-main page waits for `ctx.mainPagePromise` in `setPageResult`, as fetches do.
5. **Inactive.** Return `inactive` without effects when the scope is disposed, the options are disabled, or the subscription id is no longer current (the options changed since the push was sent).
6. **Keyed live queries.** `null` publishes `null` for `first`. The connector still deletes the item itself if it was deleted.

## Files

- `packages/vue/src/query/page.ts`: export a `publishPageResult(ctx, page, result, meta)` that shares the guts of `setPageResult` but skips the request-id check after superseding.
- `packages/vue/src/query/load.ts`: extract `updateQueryMeta` and the tracking reconciliation used by `fetchPage` into helpers the push path reuses. No behavior change for fetches.
- `packages/vue/src/query/state.ts`: helper marking a lane completed by a push.
- `packages/vue/src/query/createQuery.ts`: expose `setPageResult` on the internal return used by `runApiQuery`. Not public: underscore-prefixed or a separate internal handle.
- `packages/vue/src/api/query.ts`: pass `setResult` next to `refresh`, bound to the current subscription id.
- `packages/shared/src/types/hooks/realtime.ts`, `packages/core/src/subscription/subscribe.ts`: payload type and forwarding.
- Tests: new `packages/vue/test/integration/query/pushed-results.spec.ts`.

## Tests first

- **`responseRefs` membership:** `setResult` with rows `[2, 3]` replaces `[1, 2]` without a `fetchMany` call. Row 1 stays in the cache when another query shows it, and is collected otherwise.
- **`no-cache` values:** `setResult` shows new values that the cache doesn't hold.
- **Paginated `computed`:** pages stay computed and `meta.totalCount` updates.
- **Superseding:** a `fetchMany` held in flight (`remote.hold`) then answered after `setResult` doesn't overwrite the pushed result, and its tracking is collected.
- **Spinner:** a page loading only because of that superseded fetch stops loading; foreground `completed` is true.
- **Non-main page:** a `setResult` waits for an unresolved main page.
- **Inactive:** after scope dispose, after `enabled: false`, and after an options change, the call returns `inactive` and nothing changes.
- **Keyed:** `first` live query with `setResult(null)` shows `null`.

## Exit gate

New spec plus the existing `subscriptions`, `pagination`, `fetch-policy` and `garbage-collection` suites pass. Docs describe `setResult` and say when a connector should prefer it over `refresh`: full-result pushes use `setResult`; invalidation pings use `refresh`.

## Implementation receipt

- Status: verified; implementation and acceptance gates completed on 2026-10-23. No staging, commit or push.
- Changed files:
  - `packages/shared/src/types/hooks/realtime.ts`: documented `SetResultOutcome`, `SetResultOptions`, `SetSubscriptionResult` and optional live-query hook callback.
  - `packages/core/src/subscription/subscribe.ts`: forwards `setResult` to hooks alongside S01's existing `refresh`.
  - `packages/vue/src/api/query.ts`: late-bound main-page publication; synchronous subscription-generation invalidation on option changes, explicit unsubscribe and scope disposal. Preserves serialized subscription transitions, including recovery after an intermediate subscribe failure.
  - `packages/vue/src/query/{createQuery,types}.ts`: private `_setPageResult` adapter handle and lane completion helper type. Moved cache-result selection into `page.ts` to keep files small.
  - `packages/vue/src/query/page.ts`: common fetched/pushed representation, request supersession, main-page wait, resolved per-page policy, merged metadata and authoritative keyed `null`.
  - New `packages/vue/src/query/result.ts`: extracted fetch metadata, tracking reconciliation, discarded-page release and stale-write collection helpers, reused by pushes. Fetches retain their existing representation and tracking behavior; disabled tracking avoids extra cache reads.
  - `packages/vue/src/query/{load,state}.ts`: idempotent page-load settlement; a push settles only its page's superseded lane slots and records foreground completion without starting another fetch. Detached transport work still finishes stale-result cleanup.
  - New `packages/vue/test/integration/query/pushed-results.spec.ts`: 16 scenarios using the real store/cache/Vue scopes and shared `createVueStack`/FakeRemote/GC utilities. Covers responseRefs membership and final-owner GC, no-cache values, computed pages, metadata, foreground/background supersession, written stale-row collection, include ownership, concurrent page loads, main-page waiting/disposal, inactive callbacks and keyed null. Plain subscriptions remain without a publisher.
  - `docs/guide/plugin/hooks.md` and `docs/guide/data/live.md`: full-result `setResult` versus invalidation `refresh`, parsed result shape, connector cache writes with timestamps, metadata, representation, supersession and lifecycle outcomes.
  - This plan: status and receipt. Existing S01 edits and other plan files retained; no unrelated files edited.
- Failing-first evidence:
  - Wrote the original 11-case spec before source implementation. `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-results.spec.ts`: **10 failed, 1 passed**. Live cases failed with `payload.setResult is not a function`; non-main case failed with `query._setPageResult is not a function`. Plain subscriptions already passed. Log: `/tmp/rstore-s02-red.log`.
  - First implementation run: **1 failed, 10 passed**. Keyed null failed with `expected { id: '1', title: 'One', …(1) } to be null`, because the computed query still read the retained cache row. Corrected cache-result selection; log: `/tmp/rstore-s02-green-1.log`.
  - Broader review run caught a subscription-queue regression after skipping obsolete queued transitions: `expected [] to have a length of 1 but got +0`. Restored every queued transition while keeping old callbacks inactive; existing subscription suite now passes.
  - Final correct-source isolated baseline: **16 passed** (`/tmp/rstore-s02-probe-baseline-final.log`). Final isolated probes live under `/tmp/rstore-s02-probe`, with private config/cache and source aliases; no faults injected into the shared checkout. Removing request-id rotation caused **4 failures** (stale same-key values/membership and leaked stale row); removing pushed lane completion caused **4 failures** (loading remained true); omitting pushed ownership caused **3 failures** (retained old rows/lost new rows); omitting stale tracking collection caused **1 failure** (row 4 remained cached); dropping relation includes caused **1 failure** (`['p2', undefined]` instead of `['p2', 'Bob']`). Logs: `/tmp/rstore-s02-probe-{request-id,lane-completion,tracking,stale-tracking,relation-tracking}.log`; summary: `/tmp/rstore-s02-probe-summary.log`.
- Commands and results:
  - Used installed Node **26.2.0**, verified with `pnpm exec node --version`, plus the standalone pnpm launcher on `PATH`. Initial mise-shim attempt failed with `Read-only file system`; standalone launcher warns about its embedded Node 20, while child tools use Node 26.
  - Focused command: `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-results.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/vue/test/integration/pagination.spec.ts packages/vue/test/integration/fetch-policy.spec.ts packages/vue/test/integration/garbage-collection packages/vue/test/integration/query/pagination-results.spec.ts packages/vue/test/integration/query/resolved-pagination.spec.ts packages/vue/test/integration/query/mixed-policy-pagination.spec.ts`: **15 files, 150 tests passed** after final cleanup. Log: `/tmp/rstore-s02-focused-final.log`. Integration specs use `--project integration`, per repository config.
  - Initial `pnpm test:types` attempts found stale installed declarations for new Shared/Core types, then fixture-only excess-property errors for custom hook metadata. Rebuilt declarations with `pnpm --filter @rstore/shared build`, `pnpm --filter @rstore/core build`, and `pnpm --filter @rstore/vue build`; typed custom test metadata explicitly. All three builds passed. Logs: `/tmp/rstore-s02-build-{shared,core,vue}.log`.
  - Final `pnpm test:types`: **passed**, including all package scripts and root integration/browser checks. Log: `/tmp/rstore-s02-types-final.log`.
  - `pnpm exec eslint` on all S02 source/test files and both changed guide files: **passed**. Log: `/tmp/rstore-s02-lint.log`.
  - `pnpm docs:build` outside sandbox: **passed**, including final repeat and page rendering. Existing chunk-size and Tailwind plugin warnings remain. Logs: `/tmp/rstore-s02-docs.log`, `/tmp/rstore-s02-docs-final.log`.
  - `pnpm test` outside sandbox: **285 files / 2,075 tests passed; 1 file / 4 tests conditionally skipped**, both before and after final unnecessary-read cleanup. Logs: `/tmp/rstore-s02-full.log`, `/tmp/rstore-s02-full-final.log`.
  - `git diff --check`: **passed**. Final code/test review found no duplicated helpers or implementation-only assertions. All changed source and test files remain below 300 lines.
- Limitations / follow-ups:
  - Tests prove real query/cache/lifecycle behavior against a stateful fake backend, not external connector interoperability.
  - Subscription publication targets only the main page until S03. The non-main tests enter through the private adapter handle because S02 has no public non-main subscription entry; all assertions inspect observable page/query data, metadata and lifecycle.
  - Private non-main publication returns synchronous acceptance (`applied`) while waiting for the main page; it checks page/request ownership again before publication. Disposal during that wait cannot publish late data or metadata.
  - Result ordering and versions remain S04; `stale` is reserved and never returned by S02. Item timestamps and tombstones remain unchanged.
  - Four distribution tests require `RSTORE_DISTRIBUTION_ROOT` / `RSTORE_DISTRIBUTION_PEERS_ROOT` and are skipped by the default full suite. No implementation blocker remains.

## Review fixes

- Non-main pages wait on a main-page publication barrier (`query/publication.ts`) instead of `ctx.mainPagePromise`: it is released when the main load settles or a pushed main result lands, and waiters follow a replacement main load. `query/publicationOwnership.ts` lets a nested accepted publication (from a synchronous observer) supersede the rest of the outer one.
- A queued non-main push pins its rows under a dedicated tracking id (`pinPushedRows`) until it publishes or is dropped, so another owner's release cannot collect them meanwhile.
- `liveQuery` copies the initial query metadata before sharing it with page subscriptions, so later publications never mutate the cache entry of other options.
- Out of plan, kept for a separate decision: per-page absence tracking (`query/absence.ts`) for pushed/fetched `first` misses.
- Cleanup: `SetResultOutcome` docs state that `'applied'` means accepted, not displayed; `SetResultOptions.meta` excludes `$` fields; the non-main test publishes through a `{ pages: 'all' }` page subscription instead of the private `_setPageResult`.
