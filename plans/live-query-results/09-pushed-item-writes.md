# S09: pushed item writes

- Status: implemented; review fixes, focused tests, types, scoped lint and full suite verified (2026-10-26). See Review fixes below for current evidence and an unrelated extra-build warning.
- Depends on: S02 (S04 for versioned pushes).
- Owner: writing pushed rows into the cache.

## Outcome

`setResult` writes accepted raw pushed rows itself, through the same pipeline a fetch result goes through, and only once the push is accepted. Connectors stop re-implementing parse-and-write, and rejected or uncached pushes no longer touch the shared cache.

## Gap closed

Today the connector writes every pushed row (`$processItemParsing` + `$cache.writeItem`) before calling `setResult`, because `setResult` only publishes page membership (locked decision 3 of the series). Consequences:

- every connector duplicates the fetch path's item handling;
- rows of a push rstore then rejects (`'stale'`, `'inactive'`) are already in the cache;
- `no-cache` pages, which never write fetched rows, get pushed rows written anyway;
- pushed rows skip query tracking set up by the fetch path.

## API

```ts
hook('subscribe', ({ setResult }) => {
  onPush((rows, totalCount) => {
    setResult?.(rows, { meta: { totalCount } })
  })
})
```

- Writing is the default: rstore runs the fetch path's result handling on the rows after acceptance: `$processItemParsing`, cache writes with query tracking and `include` relations, `fieldTimestamps` when given, and no writes for `no-cache` pages. This matches fetch hooks, whose `setResult` also writes.
- Accepted rows and field stamps are cloned at acceptance. Connectors pass raw rows directly; there is no membership-only write opt-out. No-cache results still expose wrapped item APIs, computed fields and relations.
- No compatibility cost: subscribe-hook `setResult` is unreleased (added after v0.8.4), and Studio, its only user, is pinned to a pkg.pr.new build and adopts this in S12.
- Optional `fieldTimestamps` per row or per push, passed through to cache writes. Per-row arrays are index-aligned and must match row count; mismatches warn in development.

## Semantics

- Writes happen only for `'applied'`. For a queued non-main push, they happen when it publishes; a dropped queued push writes nothing (replaces today's pinning of connector-written rows for that case).
- Writes respect `$canPublishQuery` the way fetch writes do.
- Keyed `setResult(null)` does not delete the item; deletion stays the connector's call (unchanged).

## Files

- `packages/core/src/query/findMany.ts`, `findFirst.ts`: extract the result-write step (parsing, `writeItems`, tracking, `no-cache`, `$canPublishQuery`) into a shared function.
- `packages/vue/src/query/push.ts`, `result.ts`: call shared parsing and wrapping after acceptance.
- `packages/shared/src/types/hooks/realtime.ts`: `SetResultOptions.fieldTimestamps`; no write opt-out.

## Tests first

- Pushed rows land in the cache with tracking, and a garbage-collection cycle keeps them while the page shows them.
- A stale versioned push and an inactive push leave the cache untouched.
- A `no-cache` page shows the pushed values and writes nothing.
- A queued non-main push dropped before publishing writes nothing.
- Reusing connector row objects parses each accepted clone once; queued inputs stay detached.
- No-cache pushes expose the wrapped item API, computed fields and relations.
- Filtered computed pages retain roots after local cache writes remove them from the visible slice, like fetched results.
- Cancelled Core callers still receive complete parsed results; ownership suppresses writes only.

## Exit gate

Focused integration specs, garbage-collection suites, types, lint, full suite; hooks and live guides updated.

## Monospace impact

`3.realtime.ts` drops `writeItems`; the "rows written for rejected and no-cache pushes" limitation goes away.

## Implementation receipt

The original implementation record below is historical. The Review fixes section supersedes its opt-out API, continuous push watcher and validation limitations.

- Status: implemented on 2026-10-26. Focused integration/GC suites, unit contracts, workspace types, builds and scoped lint pass. Final full-suite run could not complete two Nuxt boot suites because another process owns their fixture server; details below. No staging, commit or push performed. Existing S08 work and unrelated concurrent/staged changes preserved.
- Behavior: subscribe-hook `setResult` parses and writes accepted rows by default through shared Core `processQueryResult`, also used by `findFirst` and `findMany`. `write: false` skips parsing/writing and retains membership-only publication. `fieldTimestamps` accepts a shared field map or per-row maps aligned with an array result. Cache batches forward each row's stamps into normal LWW/tombstone writes. Null first results do not delete rows.
- Publication and ownership: stale/inactive pushes never parse or write. Default queued pushes defer processing until publication; dropped pushes write nothing. Opt-out queued pushes still pin already-written rows. Cache writes carry `$canPublishQuery` and query tracking. One publication owner spans parsing, cache writes, page state, metadata and tracking, including synchronous reentrancy. Scope-owned tracking observes deferred cache writes and rebuilds current relation ownership after later moves.
- Ordering repair: a versioned fetch now reserves its version while processing rows, until publication settles. This prevents a queued older push from overwriting a newer fetch's already-written fields. Older pushes during this reservation return `stale`; the existing held-relations regression now checks full row values as well as membership. Same-options retries, unversioned queries and plain subscriptions remain covered.

### Changed files

- Core: `packages/core/src/query/{findFirst,findMany,index,processResult}.ts` (new shared result processor).
- Shared: `packages/shared/src/types/hooks/realtime.ts` (write/stamp options), `packages/shared/src/types/cache.ts` (per-row batch stamps).
- Vue: `packages/vue/src/query/{createQuery,load,page,push,result,types}.ts`, `packages/vue/src/api/livePages.ts` (forward all result options), `packages/vue/src/cache/queue.ts` (forward stamps).
- Tests: new `packages/vue/test/integration/query/pushed-item-writes.spec.ts`; `packages/vue/test/integration/query/{absence-ownership,pushed-results-ordering,queued-pushed-results}.spec.ts`; `packages/vue/test/query-public-api.test-d.ts`. Membership-only fixtures now explicitly opt out; queued ordering fixtures publish raw rows.
- Docs: `docs/guide/data/live.md`, `docs/guide/plugin/hooks.md`, `packages/vue/skills/rstore-vue/SKILL.md`, `packages/vue/skills/rstore-vue/references/api-live-query.md`, this receipt/status.
- Connector/example audit: reviewed `packages/nuxt-drizzle/src/runtime/plugin-realtime.ts`, Directus/Monospace runtimes and playground websocket plugin. Current in-repo subscribe implementations deliver row deltas, not full subscribe-hook `setResult` snapshots, so their direct cache writes remain necessary. No redundant production connector prewrites found. Removed prewrite loop from hooks guide's full-result example. External Studio connector migration remains S12.
- Size/review: every changed source file stays under 300 lines; new result processor is 67 lines. New functions/types/properties have JSDoc; non-obvious ordering, deferred ownership and reentrancy paths have comments. Shared store/remote/GC helpers reused; no new test doubles.

### Failing-first evidence

- Before implementation: `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-item-writes.spec.ts` failed 8 of the initial 10 scenarios. Decisive assertions: `expected [] to deeply equal [ 'Three', 'Four' ]`, `expected 'One' to be 'Accepted'`, and unparsed lowercase no-cache titles instead of uppercase. Raw queued publication, nested includes, timestamps, paused writes and keyed first updates also failed. Evidence retained in `/tmp/rstore-s09-red.log`.
- Queued ordering follow-up, before reservation repair: raw version-5 push overwrote version-6 fetch fields, `expected [ [ '2', 'Push 5' ] ] to deeply equal [ [ '2', 'Two' ] ]`. Evidence: `/tmp/rstore-s09-ordering-red.log`.
- Deferred-GC follow-up, before watcher repair: resumed current pushed rows disappeared after collection, `expected [] to deeply equal [ 'Current' ]`. Evidence: `/tmp/rstore-s09-paused-gc.log`.
- Relation-move follow-up, before rebuilding fresh ownership: pushed post's replacement author was collected, `expected [ undefined ] to deeply equal [ 'Cara' ]`. Evidence: `/tmp/rstore-s09-relation-move.log`.
- Final isolated fault probes used copied sources/tests and private Vite caches under `/tmp`, never mutated shared checkout. Correct snapshot: 14/14 pass. Dropping batch timestamp forwarding: timestamp regression fails with `Old` instead of `Three`. Removing push write ownership guard: three regressions fail, including superseded paused row remaining cached and `Outer` replacing nested `Inner`. Probe sources restored afterward. Evidence: `/tmp/rstore-s09-probe-{baseline,timestamps,ownership}.log`.

### Commands and results

- Tooling: prepended installed Node 26.2.0 and pnpm binary paths to bypass mise shim's sandbox write failure. `pnpm exec node --version` reports `v26.2.0`; pnpm standalone still prints its embedded engine warning.
- Requested `pnpm exec vitest run --project unit packages/vue/test/integration/query/pushed-item-writes.spec.ts`: no files discovered, because repository intentionally excludes integration directories from `unit`. Used configured integration project for actual store-backed proof.
- `pnpm exec vitest run --project integration packages/vue/test/integration/query packages/vue/test/integration/garbage-collection packages/core/test/integration/query`: **62 files / 448 tests pass**, including final 14 pushed-write scenarios. Log: `/tmp/rstore-s09-focused.log`.
- `pnpm exec vitest run --project unit packages/core/test/public-exports.spec.ts packages/shared/test/public-exports.spec.ts packages/vue/test/public-exports.spec.ts packages/core/test/crdt.spec.ts`: **4 files / 63 tests pass**. Log: `/tmp/rstore-s09-unit-final.log`.
- `pnpm --filter @rstore/shared build`, then Core and Vue builds: pass. Initial type run saw stale Shared declarations; rebuilding refreshed them. Final `pnpm test:types`: **pass**, including 21 package scripts and root integration/browser checks. Log: `/tmp/rstore-s09-types.log`.
- `pnpm exec eslint` on every changed TypeScript file plus both guides and this plan: **pass**. Skill Markdown is ignored by repository ESLint configuration and was reviewed manually. Log: `/tmp/rstore-s09-lint.log`. `git diff --check`: pass.
- `pnpm test` inside sandbox: HTTP/Nuxt suites fail with `listen EPERM`; reran with localhost access. First unrestricted run passed **320 files / 2,290 tests**, four conditional distribution tests skipped, before final relation-ownership refinement. Log: `/tmp/rstore-s09-full-unrestricted.log`.
- Final `pnpm test` with localhost access: **318 files / 2,286 tests pass**; two Nuxt boot suites cannot start, with `Another Nuxt dev server is already running` (PID 1665242, fixture `packages/nuxt/test/fixtures/devtools`). Four distribution tests and five tests in blocked boot suites skipped. Log: `/tmp/rstore-s09-full-final.log`.
- Retried `pnpm exec vitest run --project nuxt-boot packages/nuxt/test/nuxt-boot/devtools.spec.ts packages/nuxt/test/nuxt-boot/devtools-ssr.spec.ts` with localhost access: same foreign fixture lock; both suites blocked before assertions. Log: `/tmp/rstore-s09-boot-retry.log`. Did not terminate foreign process, remove lock, bypass lock or change unrelated Nuxt fixtures.

### Limitations / follow-ups

- Final aggregate exit gate remains limited by the two concurrent-server boot failures above. Rerun those two suites (or `pnpm test`) once fixture server owner releases it. No known S09 behavior failure remains in executed checks.
- Studio adoption is external S12 work; no Monospace Studio checkout modified. With `write: false`, rstore cannot undo cache writes performed through another channel before a rejected callback.

### Review fixes

Findings and changes (2026-10-26):

1. Continuous pushed-page observation reconciled fresh ownership on every cache change, collecting roots that left a computed filter or slice. Ordinary pushes now reconcile once. Only a push with its own pending paused/staggered cache writes installs a scope-owned watcher; it reuses that publication's tracking object, observes stable keyed wrappers through an envelope, and stops after its operations settle or publication is replaced. Include relation moves use the existing tracking controller. Immediate and paused filtered pages keep roots through GC and can display them again after local edits.
2. Parsing mutated connector-owned rows and queued pushes retained mutable arrays. `publishPageResult` now clones rows and shared/per-row timestamps using `klona` at acceptance, before the main-page wait. Repeated pushes parse independent copies, including nested values; later connector mutations cannot change accepted queued contents or stamps.
3. No-cache pushes exposed raw rows. New Core `wrapQueryResult` is shared by `findMany`, `findFirst` and pushed results, supplying `wrapItem({ noCache })` semantics for item methods, computed fields and cache-backed relations. Both result helpers carry `@internal` JSDoc.
4. Removed unreleased `SetResultOptions.write` and the opt-out pinning/read-back code. Default writes replace membership-only tests. The type contract rejects the removed property. Accepted pushed writes release relevant absence in other computed queries, including a same-value frozen-row push and independent page versions; optimistic rollback and keyed/unkeyed local-write distinctions remain covered.
5. Removed redundant connector pre-writes across pushed-results, ordering, settlement, reentrancy, publication ownership and queued-result specs. Retained four background-cache seeds, the existing related-author seed, and explicit preexisting-cache fixtures. Updated `writeRows` JSDoc to describe cache seeding rather than connector responsibilities. Queued publication/drop tests now prove raw rows remain unwritten while waiting, with no pin required.
6. Core result processing always unwraps and parses every row. `$canPublishQuery` fences cache writes, never complete return values; tests exercise real Core `findMany` and `findFirst` with ownership false at entry and `findMany` cancellation during parsing. Push publication rechecks ownership before wrapping and publishing.
7. Added a development warning when timestamp array length differs from row count (short, empty and long arrays covered). Updated live/query/hooks guides and Vue skill references for raw inputs, cloned acceptance, wrapped no-cache rows, ownership, absence and timestamp alignment. Overview's S09 status/design rule now matches implementation.

Evidence and commands:

- Tests-first boundary: actual Vue queries, Core find APIs, parsing hooks, cache wrappers, ownership and garbage collection execute; only remote transport/storage uses shared FakeRemote. No application behavior is mocked. Held replies release in `finally`; stack utilities own disposal.
- Before source changes, `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-item-regressions.spec.ts`: **11 failed / 1 passed**. Exact failures include `Three!!`/nested count 2 instead of `Three!`/1, queued `Mutated` plus `Appended` instead of `Accepted`, missing `$collection`, no timestamp warning, unparsed cancelled results and truncated `['One!']` instead of `['One!', 'Two!']`. Log: `/tmp/rstore-s09-review-red.log`.
- Tightened GC fixture to remove unrelated initial cache members so its decisive assertion is retention after collection. An isolated source/test/helper copy with private Vite cache under `/tmp/rstore-s09-review-probe` passes **15/15** (`/tmp/rstore-s09-review-probe-baseline.log`). Reinstating the old always-on fresh-tracking watcher only in that copy makes immediate and paused pushes fail at `peekFirst(id)?.done`: `expected undefined to be true`; fetched control passes. Log: `/tmp/rstore-s09-review-probe-old-watcher.log`. Shared checkout was never fault-injected.
- Final focused regression file: **15/15 pass**, including deferred include targets for existing and new roots and subsequent relation moves. Command: `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-item-regressions.spec.ts`. Log: `/tmp/rstore-s09-review-regressions-final.log`.
- `pnpm exec vitest run --project integration packages/vue/test/integration/query packages/vue/test/integration/garbage-collection packages/core/test/integration`: **101 files / 780 tests pass**. Log: `/tmp/rstore-s09-review-focused-final.log`.
- `pnpm exec vitest run --project unit packages/core/test/public-exports.spec.ts packages/vue/test/public-exports.spec.ts packages/shared/test/public-exports.spec.ts`: **3 files / 5 tests pass**. Log: `/tmp/rstore-s09-review-unit.log`.
- `pnpm test:types`: **pass**, all 21 package scripts plus integration/browser checks. Shared/Core declarations refreshed first; Vue's type script also builds its package. Log: `/tmp/rstore-s09-review-types.log`. Fixed intermediate portable warning-guard and schema-union narrowing errors before this passing run.
- Scoped `pnpm exec eslint` on all review-edited TypeScript files, `docs/guide/{data/live,data/query,plugin/hooks}.md`, overview and S09 plan: **pass**. Skill Markdown is ignored by repository ESLint and reviewed manually. Log: `/tmp/rstore-s09-review-lint.log`. `git diff --check`: pass. Changed source files remain under 300 lines (Core helper 76, push 110, result 212).
- `pnpm test` with localhost access: **323 files passed / 1 skipped; 2,338 tests passed / 4 skipped**, exit 0. All Nuxt boot suites completed this run; the original receipt's concurrent fixture lock did not recur. Log: `/tmp/rstore-s09-review-full.log`.
- Commands prepend installed Node 26.2.0 and pnpm binary paths to bypass mise's read-only shim failure. Standalone pnpm prints its embedded Node 20 engine warning; actual child tooling runs Node 26.

Open issues and scope:

- Additional build check (outside requested validation): `pnpm --filter @rstore/shared build` passes. `pnpm --filter @rstore/core build` emits outputs/declarations but exits 1 on `Implicitly bundling "klona"`: existing S08 subscription source imports `klona` while Core's package manifest does not declare it. Left unrelated subscription/package files unchanged; source-backed tests, full suite and types pass. Log: `/tmp/rstore-s09-review-build.log`. Vue build passes through `pnpm test:types`.
- No known S09 failure remains. Plain subscriptions and unpaged live queries pass existing integration/full-suite coverage. No staging, commits, pushes, stashes, resets or branch changes. Unrelated/concurrent work preserved.
