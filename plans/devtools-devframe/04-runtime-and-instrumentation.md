# S04: neutral runtime and instrumentation

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S01, S02, S03.
- Owner: portable runtime; no host transport or Vue imports.
- Contract: [overview](./00-overview.md).

## Outcome

One runtime registers actual Core or Vue stores, exposes bounded read DTOs, and records useful events. Nuxt owns no instrumentation state after later cutover.

## Files

Create under `packages/devtools/src/`:

- `runtime/index.ts`: public factory and small orchestration.
- `runtime/types.ts`, `registry.ts`, `registration.ts`: identity, lifecycle, disposable registration.
- `runtime/plugin.ts`: shared Plugin integration.
- `instrumentation/hooks.ts`, `history.ts`, `subscriptions.ts`, `revisions.ts`.
- `inspection/collections.ts`, `cache.ts`, `modules.ts`, `plugins.ts`, `reads.ts`.
- `test/runtime.spec.ts`, `test/history.spec.ts`, `test/inspection.spec.ts`.

Reuse S02 inspection interfaces and S03 projection. Split any source approaching 300 lines. Reuse existing test fixture factory rather than building another miniature store implementation.

## Runtime ownership

`createRstoreDevtools()` owns one session, registrations, history buffers, revision counters, and cleanup callbacks. Session kind can be supplied by browser/Node/SSR bootstrap internally; callers cannot rewrite active identity.

`attachStore(store, { id, label?, adapter?, readOnly? })` returns registration with target identity and idempotent `dispose()`. Reject duplicate live ID and duplicate store object. Store reference belongs only to live registration. Disposal removes it from registry, unsubscribes hooks/observation, closes pending reads, and notifies session consumers. Preserve ID generation counter until runtime disposal.

`plugin(options)` uses real shared Plugin contract. Current setup receives hooks and collection defaults, not store. Install hooks synchronously during setup; obtain store from `init` payload and register once there. Do not assume a nonexistent `setup({ store })` signature. Events preceding own initialization cannot be attributed safely; do not fabricate them. Attachment to existing store begins capture immediately.

S02 store `dispose` hook removes registration. Explicit registration disposal remains mandatory escape hatch for custom caches without lifecycle notification. Runtime disposal must clean every registration even if one observer cleanup throws.

## Instrumentation

1. Inventory actual fetch, mutation, cache, batch, realtime, moduleResolved, and lifecycle hooks from shared types.
2. Record operation start/result/error using hook-provided operation identity where available. If hooks lack shared identity, assign local ID and maintain correlation map for that hook family; avoid pairing by collection alone.
3. Store detached, projected arguments/results/errors when observed. Never retain whole store, live items, refs, connector instances, or callback closures in history.
4. Preserve monotonically increasing event sequence across clear-history. Track revision separately from sequence.
5. Apply count and byte limits jointly. Remove oldest complete entries until both limits hold; expose dropped count and oldest available sequence.
6. Derive subscription descriptions from actual realtime hooks. Missing observable details become unavailable fields; instrumentation must not add subscriptions to inspect them.
7. Track module resolution and plugin metadata through public store information. Module functions appear as preview metadata; invoking them is outside scope.

Each recorder catches projection/observer failure so application fetches and mutations preserve original result or error. Bound pending correlation entries too; remove on completion, registration disposal, or documented timeout. A never-settling operation cannot retain unlimited arguments.

## Reads and revisions

Implement protocol read handlers once, shared by all transports. Validate target before traversing. Resolve exact generation; absent/disposed target fails explicitly.

Collections describe names, virtual status, declared relations, and supported actions. Cache reads use `cache.inspect` or supplied adapter reader. No direct `_private` access. Apply filters before deterministic pagination; keys preserve string/number distinction. Expose layer inspection separately from effective rows.

Use cache-owned `effectiveRows()` for visible view and `rows()` for committed view. Scan at most 10,000 candidates; filter then sort/page bounded set. Report `scanTruncated` and unknown matching total when exhausted early. Collection total is cache metadata. Do not allocate full-cache projected array merely to serve one page.

Module polling is lazy: start 250 ms Core observation only when subscribed, stop when final listener detaches. Recompute detached projection and publish change only when meaningful output changes. Vue observation replaces this in S05.

Revision invalidations may coalesce within microtask. Event capture itself does not coalesce away operations. Listeners receive invalidation plus revision; clients request bounded data, not full unsolicited snapshots.

## Tests first

- Direct `createStoreCore` plus real cache records connector-backed fetch and mutation success/error.
- Two runtimes and two stores do not share history or subscriptions.
- Attach after work excludes earlier events; plugin registration occurs once on init.
- Dispose/reuse same logical ID increments generation; stale target reads fail.
- History is detached after source mutation, trims by count and bytes, preserves sequence after clear.
- Throwing observer does not change connector result/error; disposal cleans other observers.
- Core polling starts/stops with subscribers; fake timers prove bounded work.
- Unsupported cache reports unavailable without private-field fallback.
- Zero/empty keys, filter-before-page, and numeric/string key distinction survive DTO reads.

## Implementation sequence

Write behavioral fixtures first. Implement registry, then plugin binding, then bounded history. Add public inspections and revisions last. Export root factory only when working. Keep existing Nuxt instrumentation until S13 replaces consumers.

Run `pnpm exec vitest run --project unit packages/devtools/test/runtime.spec.ts packages/devtools/test/history.spec.ts packages/devtools/test/inspection.spec.ts`. Run relevant Core integration project only if touching its fixture factory or lifecycle behavior.

## Exit gate

Actual Core store can be registered, inspected, observed, disposed, and replaced without Vue/Nuxt/DOM imports. All inspection data crosses projection boundary. No application hook result changes.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `packages/devtools/src/runtime/{index,types,registration}.ts`, `src/instrumentation/{hooks,history,revisions}.ts`, `src/inspection/{cache,collections,context,metadata,modules,plugins,reads}.ts`; three named test suites. Added `$getModules()` read-only list reader to shared `StoreCore` and actual Core store implementation.
- Tests demonstrated failing before implementation: runtime/history tests were written first; coordinator captured missing-source import failures. Those setup failures establish implementation chronology, not behavioral failure sensitivity.
- Failure sensitivity: isolated `/tmp/rstore-runtime-probe-hpr2yjwm` source copy ran four real Core/runtime scenarios green. Changing only generation guard from `!==` to `<` made stale-generation assertion fail at `runtime.spec.ts:31` with `expected [Function] to throw an error`. Restoring copied source restored four green tests. Private config/cache and source aliases avoided shared checkout/dependency mutations.
- Commands and results: coordinator ran focused source Vitest suites; isolated `node node_modules/vitest/vitest.mjs run --config /tmp/rstore-runtime-probe-hpr2yjwm/vitest.config.mjs` passed, failed for intended authority defect, then passed. `node node_modules/typescript/bin/tsc --noEmit -p /tmp/rstore-runtime-tsconfig.json` and scoped `node node_modules/eslint/bin/eslint.js` passed using direct Node 26 toolchain. Normal `pnpm` wrapper initially failed before test collection due to mise read-only environment.
- Coverage: actual direct-Core store plus existing real Vue cache, stateful external backend fixture, lifecycle disposal, fresh generations, isolated stores, detached bounded history, useful success/error evidence, filters before paging, public numeric/empty keys, unsupported custom-cache capability, lazy shared module observation leases. Actual cache disposal removes authority even after earlier application observer throws.
- Limits: public hook metadata is only operation correlation identity. Concurrent reuse of same metadata and operation family deliberately leaves correlation unavailable rather than inventing a pairing. Pending and recent completed correlation records cap at 1,000 and expire after five minutes. Subscriptions cap at 1,000 descriptions. Runtime cannot reconstruct work/subscriptions completed before attachment.
- Follow-up: transport authentication, watcher propagation, browser lifecycle, SSR retention, and live MCP proof remain owned by dependent slices. Shared real cache proves API compatibility; neutral import checks must independently prove runtime import graph does not load Vue. Completed history/replies include explicit truncation; cache content filtering searches bounded previews and reports preview truncation.
- S05 integration: adapter observation callback accepts optional changed view. Module and Vue cache subscriptions share one scoped observation lease; cache changes also invalidate collection counts. Core cache remains hook-driven. Added actual runtime/Vue public-layer regression in `inspection.spec.ts`, covering visible row removal and no delivery after releasing final lease.
- S05 follow-up baseline: that new layer scenario exposed existing cache-engine overlay memo staleness. Independent application oracle failed at `inspection.spec.ts:94`: public cache still returned row whose `$layer.skip` was true. Runtime emitted cache invalidation correctly. S02 cache owner repaired underlying memo with lazy computed overlay state; independent application and inspector reads now pass. No expectation weakened and no inspector-only cache refresh added.
- Bounded batch regression: actual 1,001-create Core batch, real remote fixture, and real ordered hook observers proved diagnostic eager mapping touched tail descriptor. Before fix, precise assertion failed with `expected 1 to be +0`; after bounded 1,000-operation prefix, assertion passed and all 1,001 returned/backend rows remained correct. History explicitly marks omitted batch metadata. Probe used private copied source/config/cache; no shared defect injection or builds.
- Candidate cap regression: actual 10,001-row real cache with transparent public inspection observer first failed with 10,001 candidate visits. Reader now stops immediately after 10,000 visits, without lookahead reading another row; partial matching total stays unknown while total retains exact collection metadata count. Selected layers conservatively report incomplete scan at cap because layer row-count metadata is unavailable. Private source inspection suite passed all five cases after cache prerequisite and candidate-bound repairs; scoped TypeScript and ESLint passed.
- SSR discovery metadata: `RuntimeOptions.request` accepts shared `SessionRequest`; SSR runtime validates bounded safe metadata, owns encoded detached values, and clones each discovery reply. Ordinary Node/browser sessions omit request details. Real Core discovery test failed first with missing metadata, then six runtime tests passed; mutation of input/reply cannot rewrite owned path, read-only SSR capabilities remain enforced, and query-bearing path is rejected.

## Final coordinator acceptance

- Slice evidence: Actual Core runtime, bounded instrumentation/history/reads, exact generation, observer cleanup, batch candidate caps, and safe active SSR metadata passed source and real transport/browser acceptance. Registration replacement rejects stale authority.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
